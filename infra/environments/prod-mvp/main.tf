# MVP Prod Environment — Single-Lambda Architecture (ADR-021/022)
#
# Same shape as dev. Differences: longer log retention, higher ACU, no skip_final_snapshot.

terraform {
  required_version = ">= 1.5"

  # TODO: Switch to S3 backend once the state bucket exists:
  #   backend "s3" {
  #     bucket  = "data-streams-terraform-state"
  #     key     = "prod-mvp/terraform.tfstate"
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
      Project      = "data-streams"
      Environment  = "prod"
      ManagedBy    = "terraform"
      Architecture = "mvp"
    }
  }
}

locals {
  env    = "prod"
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
  cluster_identifier       = "${local.prefix}-${local.env}"
  engine                   = "aurora-postgresql"
  engine_mode              = "provisioned"
  engine_version           = "15.4"
  database_name            = "datastreams"
  master_username          = "datastreams"
  master_password          = var.db_master_password
  db_subnet_group_name     = aws_db_subnet_group.aurora.name
  vpc_security_group_ids   = [aws_security_group.aurora.id]
  skip_final_snapshot      = false
  final_snapshot_identifier = "${local.prefix}-${local.env}-final"
  storage_encrypted        = true

  serverlessv2_scaling_configuration {
    min_capacity = 0.5
    max_capacity = 8
  }

  tags = { Name = "${local.prefix}-aurora-${local.env}" }
}

resource "aws_rds_cluster_instance" "main" {
  identifier          = "${local.prefix}-${local.env}-1"
  cluster_identifier  = aws_rds_cluster.main.id
  instance_class      = "db.serverless"
  engine              = aws_rds_cluster.main.engine
  engine_version      = aws_rds_cluster.main.engine_version
  publicly_accessible = true

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
  for_each = toset(["shopify-orders", "gorgias-tickets"])

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
  for_each = toset(["shopify-orders", "gorgias-tickets"])

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
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "gorgias" {
  name              = "/aws/lambda/${local.prefix}-runner-gorgias-tickets-${local.env}"
  retention_in_days = 30
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
# CloudWatch Alarms — Lambda errors only (MVP)
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
  description = "Shopify store ID"
  type        = string
}

variable "gorgias_store_id" {
  description = "Gorgias store ID"
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

output "sns_alerts_arn" {
  value = aws_sns_topic.alerts.arn
}
