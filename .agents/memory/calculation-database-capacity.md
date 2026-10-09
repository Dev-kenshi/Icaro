---
name: Calculation database capacity
description: Capacity and publication checks before moving Ícaro's generated calculation corpus beyond development.
---

Keep the generated calculation corpus in development until production capacity and the data-transfer path are checked separately. A completed development import is not authorization to write the rows into production.

**Why:** Development and production databases can have different storage limits and existing usage. Publishing a schema change does not by itself confirm that the complete development dataset will be present in production.

**How to apply:** Before any production load, verify the current production quota, current database use, and measured table-plus-index size. For Replit-managed production, use Publish for schema changes and confirm how data will be handled in its UI; do not add direct production DDL or startup migrations.
