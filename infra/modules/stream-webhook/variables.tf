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

variable "sqs_process_queue_arn" {
  description = "ARN of the processing SQS queue"
  type        = string
}

variable "sqs_process_queue_url" {
  description = "URL of the processing SQS queue"
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
