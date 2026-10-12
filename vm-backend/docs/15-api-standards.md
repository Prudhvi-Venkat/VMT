# API Standards

Primary public API: versioned REST/JSON.

Required: OpenAPI, consistent errors, pagination, filtering, sorting,
idempotency keys, rate limits, bulk APIs, async job APIs, webhooks,
OAuth/API keys/service accounts, fine-grained authorization, usage
analytics and SDK generation where practical.

Example error:

``` json
{"error":{"code":"FINDING_NOT_FOUND","message":"Finding was not found","requestId":"..."}}
```

Never expose stack traces. Breaking changes require a new version or
documented migration.
