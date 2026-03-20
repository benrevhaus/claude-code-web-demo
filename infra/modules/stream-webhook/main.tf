# stream-webhook: API Gateway + SQS integration for webhook ingestion.
# Provisioned in V1 as a stub — full webhook Lambda wired in Phase 2.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  prefix      = "data-streams"
  stream_slug = "${var.source_name}-${var.stream_name}"
}

# -----------------------------------------------------------------------------
# API Gateway (HTTP API — lightweight, low-cost)
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "webhook" {
  name          = "${local.prefix}-webhook-${var.env}"
  protocol_type = "HTTP"

  tags = merge(var.tags, { Name = "${local.prefix}-webhook-${var.env}" })
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.webhook.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      method         = "$context.httpMethod"
      path           = "$context.path"
      status         = "$context.status"
      responseLength = "$context.responseLength"
    })
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "apigw" {
  name              = "/aws/apigateway/${local.prefix}-webhook-${var.env}"
  retention_in_days = 14
  tags              = var.tags
}

# SQS integration — API Gateway pushes directly to SQS (no Lambda needed for ingestion)
resource "aws_iam_role" "apigw_sqs" {
  name = "${local.prefix}-apigw-sqs-${var.env}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "apigateway.amazonaws.com" }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "apigw_sqs" {
  name = "sqs-send"
  role = aws_iam_role.apigw_sqs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:SendMessage"]
      Resource = [var.sqs_process_queue_arn]
    }]
  })
}

resource "aws_apigatewayv2_integration" "sqs" {
  api_id                 = aws_apigatewayv2_api.webhook.id
  integration_type       = "AWS_PROXY"
  integration_subtype    = "SQS-SendMessage"
  credentials_arn        = aws_iam_role.apigw_sqs.arn
  payload_format_version = "1.0"

  request_parameters = {
    QueueUrl    = var.sqs_process_queue_url
    MessageBody = "$request.body"
  }
}

resource "aws_apigatewayv2_route" "webhook" {
  api_id    = aws_apigatewayv2_api.webhook.id
  route_key = "POST /webhooks/${var.source_name}/{topic}"
  target    = "integrations/${aws_apigatewayv2_integration.sqs.id}"
}
