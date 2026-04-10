# ADR-045: Gorgias User-Agent Block and API Auth Debugging Playbook

**Status:** Accepted
**Date:** 2026-04-10

---

## Decision

The Gorgias API rejects requests from Python's default `urllib` User-Agent (`Python-urllib/3.12`). All HTTP clients in the platform that use `urllib.request` must set an explicit User-Agent header. This ADR documents the failure, the 2-hour debugging chain, and the systematic debug playbook that should have been followed from the start.

## What Happened

The Gorgias stream was fully implemented — code, models, Terraform, SSM credentials — but every request to the Gorgias API returned HTTP 403 Forbidden. The credentials were verified correct (they matched the working legacy system). Multiple auth methods were attempted (Basic auth, Bearer token, raw token). All returned 403.

The root cause: Gorgias's API applies bot protection that blocks requests with certain User-Agent strings. Python's `urllib.request.Request` automatically sets `User-Agent: Python-urllib/3.12` unless explicitly overridden. This header is commonly flagged by bot protection services.

## The Debug Chain (What Took 2 Hours)

### Phase 1: Auth method exploration (wrong direction)

The first assumption was that the auth method was wrong. The legacy PHP system uses `Authorization: {token}` where the token is a pre-encoded value. This led to testing:

1. Basic auth with email + API key → 403
2. Raw token as Authorization header → 403
3. Bearer token → 403
4. Pre-encoded base64 as Authorization header → 403

All failed. The auth method was not the problem.

### Phase 2: Credential verification (partially correct direction)

The second assumption was that the SSM credentials were wrong or in the wrong format. Testing showed:
- SSM values matched the legacy system
- Python and shell read the same values from SSM
- Base64 encoding produced the same result in Python and shell

The credentials were correct.

### Phase 3: Transport comparison (correct direction)

The breakthrough came from comparing transport methods with identical credentials:

| Method | Same credentials | Same URL | Result |
|--------|-----------------|----------|--------|
| `curl` from shell | Yes | Yes | **200 OK** |
| Python `urllib.request` | Yes | Yes | **403 Forbidden** |
| Python `http.client` | Yes | Yes | **200 OK** |
| Python `subprocess` → `curl` | Yes | Yes | **200 OK** |

The difference between `urllib` and `http.client` is the default headers. `urllib` adds `User-Agent: Python-urllib/X.Y` automatically. `http.client` sends no User-Agent unless specified. `curl` sends `User-Agent: curl/X.Y` by default.

### Phase 4: Fix

Adding `"User-Agent": "data-streams/1.0"` to the `urllib.request.Request` headers resolved the 403 immediately.

## The Debug Playbook (Follow This Next Time)

When an API returns 403 with known-correct credentials:

### Step 1: Test with curl (30 seconds)

```bash
curl -s -w "\nHTTP %{http_code}" -H "Authorization: Basic $(echo -n 'email:key' | base64)" "https://api.example.com/endpoint"
```

If curl works, the credentials are correct. Skip all auth method exploration.

### Step 2: Test with Python http.client (1 minute)

```python
import http.client
conn = http.client.HTTPSConnection("api.example.com")
conn.request("GET", "/endpoint", headers={"Authorization": "Basic ..."})
resp = conn.getresponse()
print(resp.status)
```

If `http.client` works but `urllib` doesn't, it's a header issue (almost always User-Agent).

### Step 3: Add User-Agent to urllib request (30 seconds)

```python
request = Request(url, headers={
    "Authorization": "...",
    "User-Agent": "data-streams/1.0",
})
```

### Total time following this playbook: 2 minutes

Total time without it: 2 hours.

## Why urllib Is Still Used

The platform uses `urllib.request` consistently across all clients (Shopify, Yotpo, Gorgias) because:

- It's in the Python standard library (no additional dependency)
- It works correctly on Lambda without additional packages
- The User-Agent issue is a one-line fix per client

Switching to `requests` or `httpx` would add a dependency to the Lambda package for a problem that's solved by one line. The fix is to always set an explicit User-Agent, not to change the HTTP library.

## Which Vendors Block Default User-Agents

Based on production experience:

| Vendor | Blocks `Python-urllib`? | Blocks `python-requests`? |
|--------|------------------------|--------------------------|
| Gorgias | **Yes** (403) | Unknown |
| Yotpo | No | N/A |
| Shopify | No | N/A |

Any new vendor integration should test with `curl` first, then `urllib` with an explicit User-Agent. Do not spend time debugging auth if curl works.

## Platform-Wide Fix

The User-Agent header should be set on every `urllib.request.Request` in every client. Currently applied to:

- `src/shared/gorgias_client.py` ✓

Should also be applied to (defensive, even though not currently blocked):

- `src/shared/yotpo_client.py` — uses `urllib` for oauth, bottom_lines, and widget endpoints
- Any future client using `urllib`

## Why-Not (Rejected Alternatives)

### Switch all clients to the requests library

Rejected because it adds a dependency to the Lambda deployment package for a problem that's solved by setting one header. The `requests` library also sets a default User-Agent that could be blocked by different vendors.

### Switch to http.client throughout

Rejected because `http.client` has a lower-level API that requires more code for error handling, redirects, and response parsing. `urllib` is the right abstraction level with the User-Agent fix applied.

### Set User-Agent globally via urllib opener

Rejected because global openers affect all HTTP requests in the process, including those made by boto3 and other libraries. Per-request headers are safer and more explicit.

## Assumptions

- Gorgias's bot protection is based on User-Agent string matching, not IP reputation or rate limiting.
- The `data-streams/1.0` User-Agent string is not on any vendor's block list.
- Future Python version upgrades that change the default User-Agent format will not affect the platform because explicit User-Agent headers are set on every request.

## Tribal Context

- The 2-hour debug time was spent almost entirely in the wrong direction — exploring auth methods and credential formats. The transport comparison (curl vs Python) should have been the FIRST test, not the last. This ADR's playbook exists to prevent that pattern from repeating.
- The legacy PHP system uses curl internally, which sends `User-Agent: curl/X.Y`. This is why the legacy system worked and the Python system didn't — it was never an auth issue.
- The 403 status code was misleading. Most developers associate 403 with "wrong credentials" or "insufficient permissions." In this case, it meant "your HTTP client looks like a bot." The Gorgias API does not return a helpful error body for bot-blocked requests.

## Freshness Marker

- **Captured:** 2026-04-10
- **Stale when:** the platform switches HTTP libraries, Gorgias changes their bot protection mechanism, or Python's `urllib` changes its default User-Agent to something that isn't blocked.
