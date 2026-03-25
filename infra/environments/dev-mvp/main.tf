# MVP Dev Environment — Single-Lambda Architecture (ADR-021/022)
#
# Flat file, no modules. Separate state from main.tf.
# Resources: S3, Aurora Serverless v2, 2 Lambdas, EventBridge, SNS, alarms.
# No VPC, no DynamoDB, no Step Function, no RDS Proxy.

terraform {
  required_version = ">= 1.5"

  # TODO: Switch to S3 backend once the state bucket exists:
  #   backend "s3" {
  #     bucket  = "data-streams-terraform-state"
  #     key     = "dev-mvp/terraform.tfstate"
  #     region  = "us-east-1"
  #     encrypt = true
  #   }
  backend "local" {
    path = "terraform.tfstate"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "data-streams"
      Environment = "dev"
      ManagedBy   = "terraform"
      Architecture = "mvp"
    }
  }
}

locals {
  env    = "dev"
  prefix = "data-streams"
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" { state = "available" }

# -----------------------------------------------------------------------------
# S3 — Raw data bucket
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "raw" {
  bucket = "${local.prefix}-raw-${local.env}"

  tags = { Name = "${local.prefix}-raw-${local.env}" }
}

resource "aws_s3_bucket_versioning" "raw" {
  bucket = aws_s3_bucket.raw.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_lifecycle_configuration" "raw" {
  bucket = aws_s3_bucket.raw.id

  rule {
    id     = "glacier-transition"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "GLACIER"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "raw" {
  bucket                  = aws_s3_bucket.raw.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# -----------------------------------------------------------------------------
# Aurora Serverless v2 — Public endpoint, SSL required
# -----------------------------------------------------------------------------

resource "aws_db_subnet_group" "aurora" {
  name       = "${local.prefix}-aurora-${local.env}"
  subnet_ids = data.aws_subnets.default.ids

  tags = { Name = "${local.prefix}-aurora-${local.env}" }
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_security_group" "aurora" {
  name_prefix = "${local.prefix}-aurora-${local.env}-"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Postgres from Lambda (public). SSL enforced at DB level."
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.prefix}-aurora-sg-${local.env}" }
}

resource "aws_rds_cluster" "main" {
  cluster_identifier     = "${local.prefix}-${local.env}"
  engine                 = "aurora-postgresql"
  engine_mode            = "provisioned"
  engine_version         = "15.4"
  database_name          = "datastreams"
  master_username        = "datastreams"
  master_password        = var.db_master_password
  db_subnet_group_name   = aws_db_subnet_group.aurora.name
  vpc_security_group_ids = [aws_security_group.aurora.id]
  skip_final_snapshot    = true
  storage_encrypted      = true

  serverlessv2_scaling_configuration {
    min_capacity = 0.5
    max_capacity = 2
  }

  tags = { Name = "${local.prefix}-aurora-${local.env}" }
}

resource "aws_rds_cluster_instance" "main" {
  identifier           = "${local.prefix}-${local.env}-1"
  cluster_identifier   = aws_rds_cluster.main.id
  instance_class       = "db.serverless"
  engine               = aws_rds_cluster.main.engine
  engine_version       = aws_rds_cluster.main.engine_version
  publicly_accessible  = true

  tags = { Name = "${local.prefix}-aurora-instance-${local.env}" }
}

# -----------------------------------------------------------------------------
# SSM Parameters — Placeholders (set values manually)
# -----------------------------------------------------------------------------

resource "aws_ssm_parameter" "shopify_access_token" {
  name  = "/${local.prefix}/${local.env}/shopify/access_token"
  type  = "SecureString"
  value = "PLACEHOLDER"

  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "shopify_webhook_secret" {
  name  = "/${local.prefix}/${local.env}/shopify/webhook_secret"
  type  = "SecureString"
  value = "PLACEHOLDER"

  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "brandhaus_connection_string" {
  name  = "/${local.prefix}/${local.env}/brandhaus/connection_string"
  type  = "SecureString"
  value = "PLACEHOLDER"

  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "gorgias_email" {
  name  = "/${local.prefix}/${local.env}/gorgias/email"
  type  = "SecureString"
  value = "PLACEHOLDER"

  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "gorgias_api_key" {
  name  = "/${local.prefix}/${local.env}/gorgias/api_key"
  type  = "SecureString"
  value = "PLACEHOLDER"

  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "postgres_connection_string" {
  name  = "/${local.prefix}/${local.env}/postgres/connection_string"
  type  = "SecureString"
  value = "PLACEHOLDER"

  lifecycle { ignore_changes = [value] }
}

# -----------------------------------------------------------------------------
# SNS — Alerts
# -----------------------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name = "${local.prefix}-alerts-${local.env}"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# -----------------------------------------------------------------------------
# IAM — One role per stream Lambda
# -----------------------------------------------------------------------------

resource "aws_iam_role" "stream_runner" {
  for_each = toset(["shopify-orders", "shopify-customers", "shopify-products", "shopify-inventory", "gorgias-tickets"])

  name = "${local.prefix}-runner-${each.key}-${local.env}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "stream_runner" {
  for_each = toset(["shopify-orders", "shopify-customers", "shopify-products", "shopify-inventory", "gorgias-tickets"])

  name = "stream-runner-policy"
  role = aws_iam_role.stream_runner[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3ReadWrite"
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.raw.arn}/*"
      },
      {
        Sid    = "SSMRead"
        Effect = "Allow"
        Action = ["ssm:GetParameter", "ssm:GetParameters"]
        Resource = "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/${local.prefix}/${local.env}/*"
      },
      {
        Sid    = "CloudWatchMetrics"
        Effect = "Allow"
        Action = ["cloudwatch:PutMetricData"]
        Resource = "*"
      },
      {
        Sid    = "Logs"
        Effect = "Allow"
        Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"
      },
    ]
  })
}

# -----------------------------------------------------------------------------
# Lambda — Stream runners
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "shopify" {
  name              = "/aws/lambda/${local.prefix}-runner-shopify-orders-${local.env}"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "gorgias" {
  name              = "/aws/lambda/${local.prefix}-runner-gorgias-tickets-${local.env}"
  retention_in_days = 7
}

resource "aws_lambda_function" "shopify_orders" {
  function_name = "${local.prefix}-runner-shopify-orders-${local.env}"
  role          = aws_iam_role.stream_runner["shopify-orders"].arn
  handler       = "src.lambdas.stream_runner.handler.handler"
  runtime       = "python3.12"
  timeout       = 900
  memory_size   = 512

  filename         = var.lambda_package_file
  source_code_hash = filebase64sha256(var.lambda_package_file)

  environment {
    variables = {
      RAW_BUCKET = aws_s3_bucket.raw.bucket
      ENV        = local.env
    }
  }

  depends_on = [aws_cloudwatch_log_group.shopify]

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

resource "aws_lambda_function" "gorgias_tickets" {
  function_name = "${local.prefix}-runner-gorgias-tickets-${local.env}"
  role          = aws_iam_role.stream_runner["gorgias-tickets"].arn
  handler       = "src.lambdas.stream_runner.handler.handler"
  runtime       = "python3.12"
  timeout       = 900
  memory_size   = 512

  filename         = var.lambda_package_file
  source_code_hash = filebase64sha256(var.lambda_package_file)

  environment {
    variables = {
      RAW_BUCKET = aws_s3_bucket.raw.bucket
      ENV        = local.env
    }
  }

  depends_on = [aws_cloudwatch_log_group.gorgias]

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# -----------------------------------------------------------------------------
# EventBridge — Schedules
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "shopify_orders" {
  name                = "${local.prefix}-shopify-orders-${local.env}"
  schedule_expression = "rate(5 minutes)"
  state               = "ENABLED"
}

resource "aws_cloudwatch_event_target" "shopify_orders" {
  rule = aws_cloudwatch_event_rule.shopify_orders.name
  arn  = aws_lambda_function.shopify_orders.arn

  input = jsonencode({
    source   = "shopify"
    stream   = "orders"
    store_id = var.shopify_store_id
  })
}

resource "aws_lambda_permission" "shopify_eventbridge" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.shopify_orders.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.shopify_orders.arn
}

resource "aws_cloudwatch_event_rule" "gorgias_tickets" {
  name                = "${local.prefix}-gorgias-tickets-${local.env}"
  schedule_expression = "rate(15 minutes)"
  state               = "ENABLED"
}

resource "aws_cloudwatch_event_target" "gorgias_tickets" {
  rule = aws_cloudwatch_event_rule.gorgias_tickets.name
  arn  = aws_lambda_function.gorgias_tickets.arn

  input = jsonencode({
    source   = "gorgias"
    stream   = "tickets"
    store_id = var.gorgias_store_id
  })
}

resource "aws_lambda_permission" "gorgias_eventbridge" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.gorgias_tickets.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.gorgias_tickets.arn
}

# -----------------------------------------------------------------------------
# Lambda + EventBridge — Shopify Customers (15 min)
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "shopify_customers" {
  name              = "/aws/lambda/${local.prefix}-runner-shopify-customers-${local.env}"
  retention_in_days = 7
}

resource "aws_lambda_function" "shopify_customers" {
  function_name = "${local.prefix}-runner-shopify-customers-${local.env}"
  role          = aws_iam_role.stream_runner["shopify-customers"].arn
  handler       = "src.lambdas.stream_runner.handler.handler"
  runtime       = "python3.12"
  timeout       = 900
  memory_size   = 512

  filename         = var.lambda_package_file
  source_code_hash = filebase64sha256(var.lambda_package_file)

  environment {
    variables = {
      RAW_BUCKET = aws_s3_bucket.raw.bucket
      ENV        = local.env
    }
  }

  depends_on = [aws_cloudwatch_log_group.shopify_customers]
  lifecycle { ignore_changes = [filename, source_code_hash] }
}

resource "aws_cloudwatch_event_rule" "shopify_customers" {
  name                = "${local.prefix}-shopify-customers-${local.env}"
  schedule_expression = "rate(15 minutes)"
  state               = "ENABLED"
}

resource "aws_cloudwatch_event_target" "shopify_customers" {
  rule = aws_cloudwatch_event_rule.shopify_customers.name
  arn  = aws_lambda_function.shopify_customers.arn
  input = jsonencode({ source = "shopify", stream = "customers", store_id = var.shopify_store_id })
}

resource "aws_lambda_permission" "shopify_customers_eventbridge" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.shopify_customers.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.shopify_customers.arn
}

# -----------------------------------------------------------------------------
# Lambda + EventBridge — Shopify Products (30 min)
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "shopify_products" {
  name              = "/aws/lambda/${local.prefix}-runner-shopify-products-${local.env}"
  retention_in_days = 7
}

resource "aws_lambda_function" "shopify_products" {
  function_name = "${local.prefix}-runner-shopify-products-${local.env}"
  role          = aws_iam_role.stream_runner["shopify-products"].arn
  handler       = "src.lambdas.stream_runner.handler.handler"
  runtime       = "python3.12"
  timeout       = 900
  memory_size   = 512

  filename         = var.lambda_package_file
  source_code_hash = filebase64sha256(var.lambda_package_file)

  environment {
    variables = {
      RAW_BUCKET = aws_s3_bucket.raw.bucket
      ENV        = local.env
    }
  }

  depends_on = [aws_cloudwatch_log_group.shopify_products]
  lifecycle { ignore_changes = [filename, source_code_hash] }
}

resource "aws_cloudwatch_event_rule" "shopify_products" {
  name                = "${local.prefix}-shopify-products-${local.env}"
  schedule_expression = "rate(30 minutes)"
  state               = "ENABLED"
}

resource "aws_cloudwatch_event_target" "shopify_products" {
  rule = aws_cloudwatch_event_rule.shopify_products.name
  arn  = aws_lambda_function.shopify_products.arn
  input = jsonencode({ source = "shopify", stream = "products", store_id = var.shopify_store_id })
}

resource "aws_lambda_permission" "shopify_products_eventbridge" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.shopify_products.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.shopify_products.arn
}

# -----------------------------------------------------------------------------
# Lambda + EventBridge — Shopify Inventory (15 min)
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "shopify_inventory" {
  name              = "/aws/lambda/${local.prefix}-runner-shopify-inventory-${local.env}"
  retention_in_days = 7
}

resource "aws_lambda_function" "shopify_inventory" {
  function_name = "${local.prefix}-runner-shopify-inventory-${local.env}"
  role          = aws_iam_role.stream_runner["shopify-inventory"].arn
  handler       = "src.lambdas.stream_runner.handler.handler"
  runtime       = "python3.12"
  timeout       = 900
  memory_size   = 512

  filename         = var.lambda_package_file
  source_code_hash = filebase64sha256(var.lambda_package_file)

  environment {
    variables = {
      RAW_BUCKET = aws_s3_bucket.raw.bucket
      ENV        = local.env
    }
  }

  depends_on = [aws_cloudwatch_log_group.shopify_inventory]
  lifecycle { ignore_changes = [filename, source_code_hash] }
}

resource "aws_cloudwatch_event_rule" "shopify_inventory" {
  name                = "${local.prefix}-shopify-inventory-${local.env}"
  schedule_expression = "rate(15 minutes)"
  state               = "ENABLED"
}

resource "aws_cloudwatch_event_target" "shopify_inventory" {
  rule = aws_cloudwatch_event_rule.shopify_inventory.name
  arn  = aws_lambda_function.shopify_inventory.arn
  input = jsonencode({ source = "shopify", stream = "inventory", store_id = var.shopify_store_id })
}

resource "aws_lambda_permission" "shopify_inventory_eventbridge" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.shopify_inventory.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.shopify_inventory.arn
}

# -----------------------------------------------------------------------------
# SQS — Webhook queue + DLQ
# -----------------------------------------------------------------------------

resource "aws_sqs_queue" "webhook_dlq" {
  name                      = "${local.prefix}-webhooks-dlq-${local.env}"
  message_retention_seconds = 1209600  # 14 days
}

resource "aws_sqs_queue" "webhooks" {
  name                       = "${local.prefix}-webhooks-${local.env}"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 345600  # 4 days

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.webhook_dlq.arn
    maxReceiveCount     = 3
  })
}

# -----------------------------------------------------------------------------
# Webhook API Gateway (using stream-webhook module)
# -----------------------------------------------------------------------------

module "webhook" {
  source = "../../modules/stream-webhook"

  env                  = local.env
  source_name          = "shopify"
  stream_name          = "webhooks"
  sqs_process_queue_url = aws_sqs_queue.webhooks.url
  sqs_process_queue_arn = aws_sqs_queue.webhooks.arn
  tags                 = { Project = "data-streams", Environment = local.env, ManagedBy = "terraform" }
}

# -----------------------------------------------------------------------------
# Lambda — Webhook consumer
# -----------------------------------------------------------------------------

resource "aws_iam_role" "webhook_consumer" {
  name = "${local.prefix}-webhook-consumer-${local.env}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "webhook_consumer" {
  name = "webhook-consumer-policy"
  role = aws_iam_role.webhook_consumer.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SQS"
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.webhooks.arn
      },
      {
        Sid      = "S3"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.raw.arn}/*"
      },
      {
        Sid      = "SSM"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParameters"]
        Resource = "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/${local.prefix}/${local.env}/*"
      },
      {
        Sid      = "CloudWatch"
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
      },
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "webhook_consumer" {
  name              = "/aws/lambda/${local.prefix}-webhook-consumer-${local.env}"
  retention_in_days = 7
}

resource "aws_lambda_function" "webhook_consumer" {
  function_name    = "${local.prefix}-webhook-consumer-${local.env}"
  role             = aws_iam_role.webhook_consumer.arn
  handler          = "src.lambdas.webhook_consumer.handler.handler"
  runtime          = "python3.12"
  timeout          = 30
  memory_size      = 256
  reserved_concurrent_executions = 5

  filename         = var.lambda_package_file
  source_code_hash = filebase64sha256(var.lambda_package_file)

  environment {
    variables = {
      RAW_BUCKET       = aws_s3_bucket.raw.bucket
      ENV              = local.env
      SHOPIFY_STORE_ID = var.shopify_store_id
    }
  }

  depends_on = [aws_cloudwatch_log_group.webhook_consumer]
  lifecycle { ignore_changes = [filename, source_code_hash] }
}

resource "aws_lambda_event_source_mapping" "webhook_sqs" {
  event_source_arn                   = aws_sqs_queue.webhooks.arn
  function_name                      = aws_lambda_function.webhook_consumer.arn
  batch_size                         = 1
  enabled                            = true
  function_response_types            = ["ReportBatchItemFailures"]
}

# -----------------------------------------------------------------------------
# CloudWatch Alarms
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "shopify_errors" {
  alarm_name          = "${local.prefix}-runner-shopify-orders-errors-${local.env}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 600
  statistic           = "Sum"
  threshold           = 2
  alarm_description   = "Shopify orders stream runner errors"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    FunctionName = aws_lambda_function.shopify_orders.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "gorgias_errors" {
  alarm_name          = "${local.prefix}-runner-gorgias-tickets-errors-${local.env}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 600
  statistic           = "Sum"
  threshold           = 2
  alarm_description   = "Gorgias tickets stream runner errors"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    FunctionName = aws_lambda_function.gorgias_tickets.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "customers_errors" {
  alarm_name          = "${local.prefix}-runner-shopify-customers-errors-${local.env}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 600
  statistic           = "Sum"
  threshold           = 2
  alarm_description   = "Shopify customers stream runner errors"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions = { FunctionName = aws_lambda_function.shopify_customers.function_name }
}

resource "aws_cloudwatch_metric_alarm" "products_errors" {
  alarm_name          = "${local.prefix}-runner-shopify-products-errors-${local.env}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 600
  statistic           = "Sum"
  threshold           = 2
  alarm_description   = "Shopify products stream runner errors"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions = { FunctionName = aws_lambda_function.shopify_products.function_name }
}

resource "aws_cloudwatch_metric_alarm" "inventory_errors" {
  alarm_name          = "${local.prefix}-runner-shopify-inventory-errors-${local.env}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 600
  statistic           = "Sum"
  threshold           = 2
  alarm_description   = "Shopify inventory stream runner errors"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions = { FunctionName = aws_lambda_function.shopify_inventory.function_name }
}

resource "aws_cloudwatch_metric_alarm" "webhook_consumer_errors" {
  alarm_name          = "${local.prefix}-webhook-consumer-errors-${local.env}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 600
  statistic           = "Sum"
  threshold           = 2
  alarm_description   = "Webhook consumer Lambda errors"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions = { FunctionName = aws_lambda_function.webhook_consumer.function_name }
}

resource "aws_cloudwatch_metric_alarm" "webhook_dlq_depth" {
  alarm_name          = "${local.prefix}-webhook-dlq-depth-${local.env}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Webhook DLQ has messages — failed webhook processing"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions = { QueueName = aws_sqs_queue.webhook_dlq.name }
}

# -----------------------------------------------------------------------------
# Variables
# -----------------------------------------------------------------------------

variable "alert_email" {
  description = "Email for alert notifications"
  type        = string
  default     = ""
}

variable "db_master_password" {
  description = "Aurora master password"
  type        = string
  sensitive   = true
}

variable "lambda_package_file" {
  description = "Path to the Lambda deployment package"
  type        = string
  default     = "../../../dist/lambda/data-streams.zip"
}

variable "shopify_store_id" {
  description = "Shopify store ID (e.g. your-store or your-store.myshopify.com)"
  type        = string
}

variable "gorgias_store_id" {
  description = "Gorgias store ID (e.g. vitalityextracts)"
  type        = string
  default     = "vitalityextracts"
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "raw_bucket" {
  value = aws_s3_bucket.raw.bucket
}

output "aurora_endpoint" {
  value = aws_rds_cluster.main.endpoint
}

output "shopify_runner_function" {
  value = aws_lambda_function.shopify_orders.function_name
}

output "gorgias_runner_function" {
  value = aws_lambda_function.gorgias_tickets.function_name
}

output "shopify_customers_function" {
  value = aws_lambda_function.shopify_customers.function_name
}

output "shopify_products_function" {
  value = aws_lambda_function.shopify_products.function_name
}

output "shopify_inventory_function" {
  value = aws_lambda_function.shopify_inventory.function_name
}

output "webhook_consumer_function" {
  value = aws_lambda_function.webhook_consumer.function_name
}

output "webhook_api_url" {
  value = module.webhook.api_endpoint
}

output "sns_alerts_arn" {
  value = aws_sns_topic.alerts.arn
}
