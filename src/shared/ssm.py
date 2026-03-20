"""Helpers for reading and caching SSM parameters."""

from __future__ import annotations

import os
from typing import Optional

import boto3

_ssm_client = None
_parameter_cache: dict[str, str] = {}


def _get_ssm_client():
    global _ssm_client
    if _ssm_client is None:
        _ssm_client = boto3.client("ssm")
    return _ssm_client


def get_parameter(name: str, with_decryption: bool = True) -> str:
    """Read an SSM parameter once and cache it for the Lambda execution context."""
    if name not in _parameter_cache:
        response = _get_ssm_client().get_parameter(Name=name, WithDecryption=with_decryption)
        _parameter_cache[name] = response["Parameter"]["Value"]
    return _parameter_cache[name]


def get_env_or_ssm(
    env_name: str,
    ssm_name: str,
    *,
    with_decryption: bool = True,
    fallback_ssm_name: Optional[str] = None,
) -> str:
    """Read a secret from env first, then SSM, with an optional fallback SSM path."""
    value = os.environ.get(env_name)
    if value:
        return value

    try:
        return get_parameter(ssm_name, with_decryption=with_decryption)
    except Exception:
        if fallback_ssm_name is None:
            raise
        return get_parameter(fallback_ssm_name, with_decryption=with_decryption)

