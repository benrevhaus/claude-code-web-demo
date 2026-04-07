# stream-webhook: API Gateway → routing Lambda → SQS for webhook ingestion.
#
# The HTTP API SQS-SendMessage direct integration does not support dynamic
# MessageAttributes from path parameters or headers. A thin routing Lambda
# bridges the gap: it extracts source, topic, HMAC, and secret from the
# HTTP request and sends to SQS with proper message attributes.

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
# API Gateway (HTTP API)
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

# -----------------------------------------------------------------------------
# Routing Lambda — extracts path/header metadata, sends to SQS
# -----------------------------------------------------------------------------

resource "aws_iam_role" "webhook_router" {
  name = "${local.prefix}-webhook-router-${var.env}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "webhook_router" {
  name = "webhook-router-policy"
  role = aws_iam_role.webhook_router.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SQS"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = [var.sqs_process_queue_arn]
      },
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "webhook_router" {
  name              = "/aws/lambda/${local.prefix}-webhook-router-${var.env}"
  retention_in_days = 14
  tags              = var.tags
}

# Inline Python — no deployment package needed. Extracts routing metadata
# from the HTTP request and forwards to SQS with message attributes.
resource "aws_lambda_function" "webhook_router" {
  function_name = "${local.prefix}-webhook-router-${var.env}"
  role          = aws_iam_role.webhook_router.arn
  handler       = "index.handler"
  runtime       = "python3.12"
  timeout       = 10
  memory_size   = 128

  filename = "${path.module}/router.zip"

  environment {
    variables = {
      SQS_QUEUE_URL = var.sqs_process_queue_url
    }
  }

  depends_on = [aws_cloudwatch_log_group.webhook_router]

  tags = var.tags
}

resource "aws_lambda_permission" "apigw_invoke_router" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.webhook_router.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.webhook.execution_arn}/*/*"
}

# -----------------------------------------------------------------------------
# Integration — API Gateway → routing Lambda
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.webhook.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.webhook_router.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "webhook" {
  api_id    = aws_apigatewayv2_api.webhook.id
  route_key = "POST /webhooks/{source}/{topic}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}
