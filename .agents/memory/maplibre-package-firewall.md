---
name: maplibre-gl package firewall block
description: The environment package firewall returns HTTP 403 for the maplibre-gl tarball; a clean pnpm install can fail even though package.json and the lockfile are correct.
---

The Ícaro stage pins `maplibre-gl` 5.24.0. The default registry path used by pnpm was blocked by the environment's package firewall (HTTP 403) for that tarball; downloading `https://registry.npmjs.org/maplibre-gl/-/maplibre-gl-5.24.0.tgz` directly returned 200, and the package was materialized by hand into `node_modules/.pnpm` plus the symlink in `artifacts/icaro/node_modules`.

**Why:** package.json, the lockfile, and validations can all be correct while a fresh `pnpm install` (e.g. the publish build) still fails on the same 403.

**How to apply:** If `pnpm install` fails only on maplibre-gl, fetch the tarball from registry.npmjs.org and place it manually; verify the publish build's install step before assuming deployment is safe.
