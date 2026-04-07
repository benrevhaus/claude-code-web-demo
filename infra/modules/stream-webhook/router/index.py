"""Webhook routing Lambda — bridges API Gateway to SQS with message attributes.

Extracts source, topic from path parameters and HMAC/secret from headers,
then forwards the raw body to SQS with proper message attributes that the
webhook consumer expects.
"""

import json
import os

import boto3

sqs = boto3.client("sqs")
QUEUE_URL = os.environ["SQS_QUEUE_URL"]


def handler(event, context):
    path_params = event.get("pathParameters", {}) or {}
    headers = event.get("headers", {}) or {}
    body = event.get("body", "")

    source = path_params.get("source", "")
    topic = path_params.get("topic", "")
    hmac = headers.get("x-shopify-hmac-sha256", "")
    secret = headers.get("x-data-streams-secret", "")

    if not source or not topic:
        return {"statusCode": 400, "body": json.dumps({"error": "Missing source or topic"})}

    msg_attrs = {
        "source": {"DataType": "String", "StringValue": source},
        "topic": {"DataType": "String", "StringValue": topic},
    }
    if hmac:
        msg_attrs["hmac"] = {"DataType": "String", "StringValue": hmac}
    if secret:
        msg_attrs["secret"] = {"DataType": "String", "StringValue": secret}

    sqs.send_message(
        QueueUrl=QUEUE_URL,
        MessageBody=body,
        MessageAttributes=msg_attrs,
    )

    return {"statusCode": 200, "body": json.dumps({"status": "queued"})}
