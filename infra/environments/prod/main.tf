# Prod environment — Data Streams platform

terraform {
  required_version = ">= 1.5"

  backend "s3" {
    bucket         = "data-streams-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "data-streams-terraform-locks"
    encrypt        = true
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
      Environment = "prod"
      ManagedBy   = "terraform"
    }
  }
}

locals {
  env = "prod"
}

# --- Core platform ---

module "platform" {
  source = "../../modules/stream-platform"

  env                     = local.env
  aurora_min_acu          = 0.5
  aurora_max_acu          = 8
  log_retention_days      = 30
  glacier_transition_days = 90
  alert_email             = var.alert_email

  tags = {
    Project     = "data-streams"
    Environment = local.env
  }
}

# --- Shopify Orders stream (polling) ---

module "shopify_orders_poller" {
  source = "../../modules/stream-poller"

  env                            = local.env
  source_name                    = "shopify"
  stream_name                    = "orders"
  schedule_expression            = "rate(5 minutes)"
  freshness_sla_minutes          = 10
  processor_reserved_concurrency = 10
  lambda_package_file            = "${path.root}/../../../dist/lambda/data-streams.zip"

  raw_bucket_name             = module.platform.raw_bucket_name
  control_table_name          = module.platform.control_table_name
  initializer_role_arn        = module.platform.initializer_role_arn
  poller_role_arn             = module.platform.poller_role_arn
  processor_role_arn          = module.platform.processor_role_arn
  finalizer_role_arn          = module.platform.finalizer_role_arn
  vpc_subnet_ids              = module.platform.private_subnet_ids
  vpc_security_group_ids      = [module.platform.lambda_security_group_id]
  sns_alerts_arn              = module.platform.sns_alerts_arn
  step_function_log_group_arn = module.platform.step_function_log_group_arn
  sqs_process_queue_name      = module.platform.sqs_process_queue_name
  sqs_dlq_name                = module.platform.sqs_dlq_name

  tags = {
    Project     = "data-streams"
    Environment = local.env
  }
}

# --- Webhook endpoint (stub for V1) ---

module "webhook" {
  source = "../../modules/stream-webhook"

  env                   = local.env
  source_name           = "shopify"
  stream_name           = "orders"
  sqs_process_queue_arn = module.platform.sqs_process_queue_arn
  sqs_process_queue_url = module.platform.sqs_process_queue_url

  tags = {
    Project     = "data-streams"
    Environment = local.env
  }
}

# --- Variables ---

variable "alert_email" {
  description = "Email for alert notifications"
  type        = string
  default     = ""
}

# --- Outputs ---

output "raw_bucket" {
  value = module.platform.raw_bucket_name
}

output "control_table" {
  value = module.platform.control_table_name
}

output "rds_proxy_endpoint" {
  value = module.platform.rds_proxy_endpoint
}

output "step_function_arn" {
  value = module.shopify_orders_poller.step_function_arn
}

output "webhook_endpoint" {
  value = module.webhook.api_endpoint
}

output "poller_function" {
  value = module.shopify_orders_poller.poller_function_name
}

output "processor_function" {
  value = module.shopify_orders_poller.processor_function_name
}

output "finalizer_function" {
  value = module.shopify_orders_poller.finalizer_function_name
}
