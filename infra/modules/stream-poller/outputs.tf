output "step_function_arn" {
  value = aws_sfn_state_machine.poll.arn
}

output "step_function_name" {
  value = aws_sfn_state_machine.poll.name
}

output "initializer_function_name" {
  value = aws_lambda_function.initializer.function_name
}

output "poller_function_name" {
  value = aws_lambda_function.poller.function_name
}

output "processor_function_name" {
  value = aws_lambda_function.processor.function_name
}

output "finalizer_function_name" {
  value = aws_lambda_function.finalizer.function_name
}

output "eventbridge_rule_name" {
  value = aws_cloudwatch_event_rule.schedule.name
}

output "dashboard_name" {
  value = aws_cloudwatch_dashboard.stream.dashboard_name
}
