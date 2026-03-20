# stream-poller: Parameterized per stream — Lambda functions, Step Function, EventBridge.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  prefix      = "data-streams"
  stream_slug = "${var.source_name}-${var.stream_name}"
  account_id  = data.aws_caller_identity.current.account_id
  region      = data.aws_region.current.name
}

# -----------------------------------------------------------------------------
# Lambda Functions
# -----------------------------------------------------------------------------

# Placeholder deployment package — replaced by CI/CD or manual deploy
data "archive_file" "placeholder" {
  type        = "zip"
  output_path = "${path.module}/placeholder.zip"

  source {
    content  = "def handler(event, context): pass"
    filename = "handler.py"
  }
}

resource "aws_lambda_function" "initializer" {
  function_name = "${local.prefix}-initializer-${var.env}"
  role          = var.initializer_role_arn
  handler       = "handler.handler"
  runtime       = "python3.12"
  timeout       = 30
  memory_size   = 128

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  vpc_config {
    subnet_ids         = var.vpc_subnet_ids
    security_group_ids = var.vpc_security_group_ids
  }

  environment {
    variables = {
      CONTROL_TABLE = var.control_table_name
      ENV           = var.env
    }
  }

  tags = merge(var.tags, { stream = local.stream_slug })

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

resource "aws_lambda_function" "poller" {
  function_name = "${local.prefix}-poller-${var.env}"
  role          = var.poller_role_arn
  handler       = "handler.handler"
  runtime       = "python3.12"
  timeout       = var.lambda_timeout
  memory_size   = var.lambda_memory

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  vpc_config {
    subnet_ids         = var.vpc_subnet_ids
    security_group_ids = var.vpc_security_group_ids
  }

  environment {
    variables = {
      RAW_BUCKET    = var.raw_bucket_name
      CONTROL_TABLE = var.control_table_name
      ENV           = var.env
    }
  }

  tags = merge(var.tags, { stream = local.stream_slug })

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

resource "aws_lambda_function" "processor" {
  function_name                  = "${local.prefix}-processor-${var.env}"
  role                           = var.processor_role_arn
  handler                        = "handler.handler"
  runtime                        = "python3.12"
  timeout                        = var.lambda_timeout
  memory_size                    = var.lambda_memory
  reserved_concurrent_executions = var.processor_reserved_concurrency

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  vpc_config {
    subnet_ids         = var.vpc_subnet_ids
    security_group_ids = var.vpc_security_group_ids
  }

  environment {
    variables = {
      RAW_BUCKET    = var.raw_bucket_name
      CONTROL_TABLE = var.control_table_name
      ENV           = var.env
    }
  }

  tags = merge(var.tags, { stream = local.stream_slug })

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

resource "aws_lambda_function" "finalizer" {
  function_name = "${local.prefix}-finalizer-${var.env}"
  role          = var.finalizer_role_arn
  handler       = "handler.handler"
  runtime       = "python3.12"
  timeout       = 60
  memory_size   = 128

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  vpc_config {
    subnet_ids         = var.vpc_subnet_ids
    security_group_ids = var.vpc_security_group_ids
  }

  environment {
    variables = {
      CONTROL_TABLE = var.control_table_name
      ENV           = var.env
    }
  }

  tags = merge(var.tags, { stream = local.stream_slug })

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# -----------------------------------------------------------------------------
# Step Function — Incremental Poll
# -----------------------------------------------------------------------------

resource "aws_iam_role" "step_function" {
  name = "${local.prefix}-sfn-${local.stream_slug}-${var.env}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "states.amazonaws.com" }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "step_function" {
  name = "sfn-policy"
  role = aws_iam_role.step_function.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = [
          aws_lambda_function.initializer.arn,
          aws_lambda_function.poller.arn,
          aws_lambda_function.processor.arn,
          aws_lambda_function.finalizer.arn,
        ]
      },
      {
        Effect   = "Allow"
        Action   = [
          "logs:CreateLogDelivery",
          "logs:GetLogDelivery",
          "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery",
          "logs:ListLogDeliveries",
          "logs:PutResourcePolicy",
          "logs:DescribeResourcePolicies",
          "logs:DescribeLogGroups"
        ]
        Resource = ["*"]
      }
    ]
  })
}

# The Step Function definition matches docs/specs/step-function-design.md:
#   Initialize → FetchPage → ProcessPage → UpdateAccumulator → CheckMore
#     ├─ has_more=true AND page < max → ThrottleWait → FetchPage (loop)
#     └─ else → Finalize
#   Error: HandleFetchError → Finalize, HandleProcessError → UpdateAccumulator (continue)
#
# Initialize is a Lambda Task that:
#   - Generates run_id (UUID)
#   - Creates run record in DynamoDB (status: "running")
#   - Reads last cursor from DynamoDB (CURSOR#current)
#   - Returns full accumulator state for the state machine

resource "aws_sfn_state_machine" "poll" {
  name     = "${local.prefix}-poll-${local.stream_slug}-${var.env}"
  role_arn = aws_iam_role.step_function.arn

  logging_configuration {
    log_destination        = "${var.step_function_log_group_arn}:*"
    include_execution_data = true
    level                  = "ERROR"
  }

  definition = jsonencode({
    Comment        = "Incremental poll: ${var.source_name}/${var.stream_name}"
    StartAt        = "Initialize"
    TimeoutSeconds = var.step_function_timeout_seconds

    States = {
      # Initialize: Lambda that generates run_id, creates run record in DynamoDB,
      # reads last cursor, and returns the full accumulator state.
      # Input: { source, stream, store_id, max_pages } (from EventBridge)
      # Output: { run_id, stream_config, store_id, cursor, page_number, total_records, total_pages, max_pages, status }
      Initialize = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.initializer.arn
          Payload = {
            "source.$"              = "$.source"
            "stream.$"              = "$.stream"
            "store_id.$"            = "$.store_id"
            "max_pages.$"           = "$.max_pages"
            "cursor_override.$"     = "$.cursor_override"
            "max_pages_override.$"  = "$.max_pages_override"
          }
        }
        ResultSelector = {
          "run_id.$"        = "$.Payload.run_id"
          "stream_config.$" = "$.Payload.stream_config"
          "store_id.$"      = "$.Payload.store_id"
          "cursor.$"        = "$.Payload.cursor"
          "page_number.$"   = "$.Payload.page_number"
          "total_records.$" = "$.Payload.total_records"
          "total_pages.$"   = "$.Payload.total_pages"
          "max_pages.$"     = "$.Payload.max_pages"
          "status.$"        = "$.Payload.status"
        }
        ResultPath = "$"
        Next = "FetchPage"
      }

      FetchPage = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.poller.arn
          Payload = {
            "run_id.$"        = "$.run_id"
            "stream_config.$" = "$.stream_config"
            "store_id.$"      = "$.store_id"
            "cursor.$"        = "$.cursor"
            "page_number.$"   = "$.page_number"
          }
        }
        ResultPath = "$.fetch_result"
        ResultSelector = {
          "run_id.$"               = "$.Payload.run_id"
          "s3_key.$"               = "$.Payload.s3_key"
          "record_count.$"         = "$.Payload.record_count"
          "next_cursor.$"          = "$.Payload.next_cursor"
          "has_more.$"             = "$.Payload.has_more"
          "http_status.$"          = "$.Payload.http_status"
          "rate_limit_remaining.$" = "$.Payload.rate_limit_remaining"
          "rate_limit_reset_at.$"  = "$.Payload.rate_limit_reset_at"
        }
        Retry = [{
          ErrorEquals     = ["States.TaskFailed"]
          IntervalSeconds = 2
          MaxAttempts     = 3
          BackoffRate     = 2.0
        }]
        Catch = [{
          ErrorEquals = ["States.ALL"]
          ResultPath  = "$.error"
          Next        = "HandleFetchError"
        }]
        Next = "ProcessPage"
      }

      ProcessPage = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.processor.arn
          Payload = {
            "source.$"   = "$.stream_config.source"
            "stream.$"   = "$.stream_config.stream"
            "s3_key.$"   = "$.fetch_result.s3_key"
            "run_id.$"   = "$.run_id"
            "store_id.$" = "$.store_id"
            "trigger"    = "poll"
          }
        }
        ResultPath = "$.process_result"
        ResultSelector = {
          "records_processed.$" = "$.Payload.records_processed"
          "records_skipped.$"   = "$.Payload.records_skipped"
          "records_failed.$"    = "$.Payload.records_failed"
          "schema_version.$"    = "$.Payload.schema_version"
        }
        Catch = [{
          ErrorEquals = ["States.ALL"]
          ResultPath  = "$.process_error"
          Next        = "HandleProcessError"
        }]
        Next = "UpdateAccumulator"
      }

      UpdateAccumulator = {
        Type    = "Pass"
        Comment = "Update running totals and cursor for next iteration"
        Parameters = {
          "run_id.$"        = "$.run_id"
          "stream_config.$" = "$.stream_config"
          "store_id.$"      = "$.store_id"
          "cursor.$"        = "$.fetch_result.next_cursor"
          "page_number.$"   = "States.MathAdd($.page_number, 1)"
          "total_records.$" = "States.MathAdd($.total_records, $.fetch_result.record_count)"
          "total_pages.$"   = "States.MathAdd($.total_pages, 1)"
          "has_more.$"      = "$.fetch_result.has_more"
          "max_pages.$"     = "$.max_pages"
          "status"          = "running"
        }
        Next = "CheckMore"
      }

      CheckMore = {
        Type = "Choice"
        Choices = [
          {
            And = [
              { Variable = "$.has_more", BooleanEquals = true },
              { Variable = "$.page_number", NumericLessThanPath = "$.max_pages" }
            ]
            Next = "ThrottleWait"
          }
        ]
        Default = "PrepareFinalize"
      }

      # Normalize state shape before Finalize so both success and error
      # paths provide the same fields (final_cursor, error_message, status).
      PrepareFinalize = {
        Type = "Pass"
        Parameters = {
          "run_id.$"        = "$.run_id"
          "stream_config.$" = "$.stream_config"
          "store_id.$"      = "$.store_id"
          "total_pages.$"   = "$.total_pages"
          "total_records.$" = "$.total_records"
          "status"          = "success"
          "final_cursor.$"  = "$.cursor"
          "error_message"   = null
        }
        Next = "Finalize"
      }

      ThrottleWait = {
        Type    = "Wait"
        Seconds = 1
        Next    = "FetchPage"
      }

      HandleFetchError = {
        Type = "Pass"
        Parameters = {
          "run_id.$"        = "$.run_id"
          "stream_config.$" = "$.stream_config"
          "store_id.$"      = "$.store_id"
          "total_pages.$"   = "$.total_pages"
          "total_records.$" = "$.total_records"
          "status"          = "partial_failure"
          "error_message.$" = "States.Format('Fetch failed: {}', $.error.Cause)"
          "final_cursor.$"  = "$.cursor"
        }
        Next = "Finalize"
      }

      HandleProcessError = {
        Type    = "Pass"
        Comment = "Log process error but continue — don't abort the run"
        Result  = { "status" = "partial_failure" }
        ResultPath = "$.process_status"
        Next    = "UpdateAccumulator"
      }

      Finalize = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.finalizer.arn
          Payload = {
            "run_id.$"         = "$.run_id"
            "stream_config.$"  = "$.stream_config"
            "store_id.$"       = "$.store_id"
            "total_pages.$"    = "$.total_pages"
            "total_records.$"  = "$.total_records"
            "status.$"         = "$.status"
            "final_cursor.$"   = "$.final_cursor"
            "error_message.$"  = "$.error_message"
          }
        }
        ResultPath = "$.finalize_result"
        End = true
      }
    }
  })

  tags = merge(var.tags, { stream = local.stream_slug })
}

# -----------------------------------------------------------------------------
# EventBridge — Schedule trigger
# -----------------------------------------------------------------------------

resource "aws_iam_role" "eventbridge" {
  name = "${local.prefix}-eb-${local.stream_slug}-${var.env}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "events.amazonaws.com" }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "eventbridge" {
  name = "start-sfn"
  role = aws_iam_role.eventbridge.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["states:StartExecution"]
      Resource = [aws_sfn_state_machine.poll.arn]
    }]
  })
}

resource "aws_cloudwatch_event_rule" "schedule" {
  name                = "${local.prefix}-poll-${local.stream_slug}-${var.env}"
  schedule_expression = var.schedule_expression
  state               = "ENABLED"

  tags = merge(var.tags, { stream = local.stream_slug })
}

# EventBridge input: minimal — Initialize Lambda enriches it with run_id,
# stream_config (loaded from YAML), and cursor (read from DynamoDB).
# Supports backfill overrides per docs/specs/step-function-design.md.
resource "aws_cloudwatch_event_target" "step_function" {
  rule     = aws_cloudwatch_event_rule.schedule.name
  arn      = aws_sfn_state_machine.poll.arn
  role_arn = aws_iam_role.eventbridge.arn

  input = jsonencode({
    source           = var.source_name
    stream           = var.stream_name
    store_id         = "default"
    max_pages        = 200
    cursor_override  = null
    max_pages_override = null
  })
}

# -----------------------------------------------------------------------------
# CloudWatch Alarms (5 required per docs/guides/operability.md)
# -----------------------------------------------------------------------------

# 1. Freshness SLA breach
resource "aws_cloudwatch_metric_alarm" "freshness" {
  alarm_name          = "${local.prefix}-freshness-${local.stream_slug}-${var.env}"
  alarm_description   = "Data freshness exceeds ${var.freshness_sla_minutes}min SLA for ${local.stream_slug}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "freshness_lag_minutes"
  namespace           = "DataStreams"
  period              = 300
  statistic           = "Maximum"
  threshold           = var.freshness_sla_minutes
  treat_missing_data  = "breaching"
  alarm_actions       = [var.sns_alerts_arn]
  ok_actions          = [var.sns_alerts_arn]

  dimensions = {
    source = var.source_name
    stream = var.stream_name
  }

  tags = var.tags
}

# 2. Run failure (Step Function execution failed)
resource "aws_cloudwatch_metric_alarm" "sfn_failed" {
  alarm_name          = "${local.prefix}-sfn-failed-${local.stream_slug}-${var.env}"
  alarm_description   = "Step Function execution failed for ${local.stream_slug}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ExecutionsFailed"
  namespace           = "AWS/States"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_actions       = [var.sns_alerts_arn]
  ok_actions          = [var.sns_alerts_arn]

  dimensions = {
    StateMachineArn = aws_sfn_state_machine.poll.arn
  }

  tags = var.tags
}

# 3. DLQ depth (defined in stream-platform module — see dlq_messages alarm)

# 4. Error rate — processor Lambda errors
resource "aws_cloudwatch_metric_alarm" "processor_errors" {
  alarm_name          = "${local.prefix}-processor-errors-${local.stream_slug}-${var.env}"
  alarm_description   = "Processor Lambda error rate elevated for ${local.stream_slug}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 2
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.sns_alerts_arn]
  ok_actions          = [var.sns_alerts_arn]

  dimensions = {
    FunctionName = aws_lambda_function.processor.function_name
  }

  tags = var.tags
}

# 5. 429 storm — excessive rate limiting from vendor API
resource "aws_cloudwatch_metric_alarm" "rate_limit_storm" {
  alarm_name          = "${local.prefix}-429-storm-${local.stream_slug}-${var.env}"
  alarm_description   = "Excessive 429 rate limiting from vendor API for ${local.stream_slug}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "http_429_count"
  namespace           = "DataStreams"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.sns_alerts_arn]
  ok_actions          = [var.sns_alerts_arn]

  dimensions = {
    source = var.source_name
    stream = var.stream_name
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# CloudWatch Dashboard (7 widgets per docs/guides/operability.md)
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_dashboard" "stream" {
  dashboard_name = "${local.prefix}-${local.stream_slug}-${var.env}"

  dashboard_body = jsonencode({
    widgets = [
      # 1. Freshness lag (line chart)
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Freshness Lag (minutes)"
          region = local.region
          metrics = [
            ["DataStreams", "freshness_lag_minutes", "source", var.source_name, "stream", var.stream_name]
          ]
          annotations = {
            horizontal = [{
              label = "SLA"
              value = var.freshness_sla_minutes
              color = "#d62728"
            }]
          }
          period = 300
          stat   = "Maximum"
          view   = "timeSeries"
        }
      },
      # 2. Throughput — records processed per run
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Records Processed"
          region = local.region
          metrics = [
            ["DataStreams", "records_processed", "source", var.source_name, "stream", var.stream_name, { stat = "Sum" }],
            ["DataStreams", "records_skipped", "source", var.source_name, "stream", var.stream_name, { stat = "Sum" }],
            ["DataStreams", "records_failed", "source", var.source_name, "stream", var.stream_name, { stat = "Sum" }]
          ]
          period = 300
          view   = "timeSeries"
        }
      },
      # 3. Step Function executions
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 8
        height = 6
        properties = {
          title  = "Step Function Executions"
          region = local.region
          metrics = [
            ["AWS/States", "ExecutionsSucceeded", "StateMachineArn", aws_sfn_state_machine.poll.arn, { stat = "Sum" }],
            ["AWS/States", "ExecutionsFailed", "StateMachineArn", aws_sfn_state_machine.poll.arn, { stat = "Sum" }],
            ["AWS/States", "ExecutionsTimedOut", "StateMachineArn", aws_sfn_state_machine.poll.arn, { stat = "Sum" }]
          ]
          period = 300
          view   = "timeSeries"
        }
      },
      # 4. Lambda duration
      {
        type   = "metric"
        x      = 8
        y      = 6
        width  = 8
        height = 6
        properties = {
          title  = "Lambda Duration (ms)"
          region = local.region
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.poller.function_name, { stat = "Average", label = "Poller" }],
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.processor.function_name, { stat = "Average", label = "Processor" }],
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.finalizer.function_name, { stat = "Average", label = "Finalizer" }]
          ]
          period = 300
          view   = "timeSeries"
        }
      },
      # 5. Lambda errors
      {
        type   = "metric"
        x      = 16
        y      = 6
        width  = 8
        height = 6
        properties = {
          title  = "Lambda Errors"
          region = local.region
          metrics = [
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.poller.function_name, { stat = "Sum", label = "Poller" }],
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.processor.function_name, { stat = "Sum", label = "Processor" }],
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.finalizer.function_name, { stat = "Sum", label = "Finalizer" }]
          ]
          period = 300
          view   = "timeSeries"
        }
      },
      # 6. API health — HTTP status and rate limits
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "Vendor API Health"
          region = local.region
          metrics = [
            ["DataStreams", "http_429_count", "source", var.source_name, "stream", var.stream_name, { stat = "Sum", label = "429s" }],
            ["DataStreams", "http_5xx_count", "source", var.source_name, "stream", var.stream_name, { stat = "Sum", label = "5xx" }],
            ["DataStreams", "pages_fetched", "source", var.source_name, "stream", var.stream_name, { stat = "Sum", label = "Pages" }]
          ]
          period = 300
          view   = "timeSeries"
        }
      },
      # 7. Queue depth (SQS processing queue + DLQ)
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "Queue Depth"
          region = local.region
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.sqs_process_queue_name, { stat = "Maximum", label = "Process Queue" }],
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.sqs_dlq_name, { stat = "Maximum", label = "DLQ" }]
          ]
          period = 300
          view   = "timeSeries"
        }
      }
    ]
  })
}
