variable "env" {
  description = "Environment name (dev, prod)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (need 2+ AZs for Aurora)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "aurora_min_acu" {
  description = "Minimum ACU for Aurora Serverless v2"
  type        = number
  default     = 0.5
}

variable "aurora_max_acu" {
  description = "Maximum ACU for Aurora Serverless v2"
  type        = number
  default     = 4
}

variable "db_name" {
  description = "Postgres database name"
  type        = string
  default     = "datastreams"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "alert_email" {
  description = "Email for SNS alert subscriptions"
  type        = string
  default     = ""
}

variable "glacier_transition_days" {
  description = "Days before S3 objects transition to Glacier"
  type        = number
  default     = 90
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default     = {}
}
