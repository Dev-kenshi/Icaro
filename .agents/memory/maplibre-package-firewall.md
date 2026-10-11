---
name: maplibre-gl package firewall block
description: The environment package firewall returns HTTP 403 for every maplibre-gl tarball version; the durable fix is a vendored tarball with a file: dependency.
---

The Replit package firewall (`package-firewall.replit.internal`) returns HTTP 403 for **all** maplibre-gl tarball versions (tested 3.6.2–5.24.0), while package metadata and other packages fetch fine. Downloading the tarball from `https://registry.npmjs.org` directly works. This broke the publish build: the deploy builder runs a fresh `pnpm install` through the same firewall and failed with `ERR_PNPM_FETCH_403`, even though dev installs had been repaired by hand.

**Why:** package.json, the lockfile, and dev validations can all be correct while the publish build's clean `pnpm install` still fails on the same 403. Manually materializing into `node_modules` fixes dev only.

**How to apply:** `maplibre-gl` is vendored at `artifacts/icaro/vendor/maplibre-gl-5.24.0.tgz` and referenced in `artifacts/icaro/package.json` as `file:vendor/maplibre-gl-5.24.0.tgz`; the lockfile records a `file:` resolution with the official sha512 integrity, so no firewall fetch ever happens. To upgrade the package, download the new tarball from registry.npmjs.org, replace the vendored file, update the `file:` path, and run `pnpm install`. Never switch the dependency back to a bare registry version without confirming the firewall quarantine has lifted, or publishing will fail again.
