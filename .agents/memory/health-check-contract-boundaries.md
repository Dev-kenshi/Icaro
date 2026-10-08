---
name: Health check contract boundaries
description: Distinguish shared OpenAPI contract checks from separately registered server routes.
---

Health checks should validate behavior against its actual source of truth instead of assuming every server route belongs in OpenAPI. Test declared endpoints through the shared contract and separately mounted routes through their router or runtime registration.

**Why:** In Ícaro, authentication routes are implemented separately from the OpenAPI contract; assuming login was declared there created a false failure.

**How to apply:** Before asserting that a route exists in OpenAPI, verify that the contract owns it. Keep separate checks for route modules or mounts that are intentionally outside the shared specification.
