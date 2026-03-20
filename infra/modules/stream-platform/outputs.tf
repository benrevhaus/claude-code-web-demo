output "raw_bucket_name" {
  value = aws_s3_bucket.raw.id
}

output "raw_bucket_arn" {
  value = aws_s3_bucket.raw.arn
}

output "control_table_name" {
  value = aws_dynamodb_table.control.name
}

output "control_table_arn" {
  value = aws_dynamodb_table.control.arn
}

output "aurora_cluster_endpoint" {
  value = aws_rds_cluster.main.endpoint
}

output "rds_proxy_endpoint" {
  value = aws_db_proxy.main.endpoint
}

output "vpc_id" {
  value = aws_vpc.main.id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "lambda_security_group_id" {
  value = aws_security_group.lambda.id
}

output "initializer_role_arn" {
  value = aws_iam_role.initializer.arn
}

output "poller_role_arn" {
  value = aws_iam_role.poller.arn
}

output "processor_role_arn" {
  value = aws_iam_role.processor.arn
}

output "finalizer_role_arn" {
  value = aws_iam_role.finalizer.arn
}

output "sns_alerts_arn" {
  value = aws_sns_topic.alerts.arn
}

output "sqs_process_queue_arn" {
  value = aws_sqs_queue.process.arn
}

output "sqs_process_queue_url" {
  value = aws_sqs_queue.process.url
}

output "sqs_dlq_arn" {
  value = aws_sqs_queue.dlq.arn
}

output "sqs_process_queue_name" {
  value = aws_sqs_queue.process.name
}

output "sqs_dlq_name" {
  value = aws_sqs_queue.dlq.name
}

output "poller_log_group_name" {
  value = aws_cloudwatch_log_group.poller.name
}

output "processor_log_group_name" {
  value = aws_cloudwatch_log_group.processor.name
}

output "finalizer_log_group_name" {
  value = aws_cloudwatch_log_group.finalizer.name
}

output "step_function_log_group_arn" {
  value = aws_cloudwatch_log_group.step_function.arn
}
