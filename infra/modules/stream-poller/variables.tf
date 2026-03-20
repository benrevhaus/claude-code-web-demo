variable "env" {
  description = "Environment name (dev, prod)"
  type        = string
}

variable "source_name" {
  description = "Data source name (e.g. shopify)"
  type        = string
}

variable "stream_name" {
  description = "Stream name (e.g. orders)"
  type        = string
}

variable "schedule_expression" {
  description = "EventBridge schedule expression"
  type        = string
  default     = "rate(5 minutes)"
}

variable "step_function_timeout_seconds" {
  description = "Step Function execution timeout"
  type        = number
  default     = 1800 # 30 minutes
}

variable "lambda_timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 120
}

variable "lambda_memory" {
  description = "Lambda function memory in MB"
  type        = number
  default     = 256
}

variable "processor_reserved_concurrency" {
  description = "Max concurrent processor Lambda invocations"
  type        = number
  default     = 5
}

variable "lambda_package_file" {
  description = "Path to the built Lambda deployment zip"
  type        = string
}

# Passed from stream-platform
variable "raw_bucket_name" { type = string }
variable "control_table_name" { type = string }
variable "initializer_role_arn" { type = string }
variable "poller_role_arn" { type = string }
variable "processor_role_arn" { type = string }
variable "finalizer_role_arn" { type = string }
variable "vpc_subnet_ids" { type = list(string) }
variable "vpc_security_group_ids" { type = list(string) }
variable "sns_alerts_arn" { type = string }
variable "step_function_log_group_arn" { type = string }
variable "sqs_process_queue_name" { type = string }
variable "sqs_dlq_name" { type = string }

variable "freshness_sla_minutes" {
  description = "Freshness SLA in minutes (from stream spec)"
  type        = number
  default     = 10
}

variable "tags" {
  type    = map(string)
  default = {}
}
