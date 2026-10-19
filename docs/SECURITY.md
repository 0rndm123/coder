# Security assessment (2026-10-19)

## Scope and assurance
This is a code review / incremental hardening of a browser MVP, **not a penetration test, production security certification or assertion of zero vulnerabilities**. Security controls must also be assessed in hosting, database, identity and operational procedures.

## Trust boundaries
- **Untrusted input**: decoded QR/barcode value, HID input, manually typed text, imported JSON Lines, and third-party JavaScript.
- **Browser permissions**: camera only after user permission; a page opened in HTTPS or trusted localhost.
- **Current storage**: browser localStorage is accessible to same-origin scripts, is unencrypted at the app layer, and may be cleared by the browser.
- **Public deployment**: without authentication, anyone able to access the site can use the app; each browser has its own local data. There is no central access-control boundary.

## Controls implemented on review branch
- Untrusted code values are displayed through `textContent`, never `innerHTML`, and are not opened automatically as links.
- A baseline Content Security Policy blocks arbitrary inline **scripts**, `object` embedding and non-approved script origins. Application JS/CSS now live in separate files.
- Domain rules are centralized and unit tested: event structure, source, movement, timestamp, length cap (16,384 characters) and JSON Lines import count cap (20,000 records).
- The interface rejects imported files above 5 MiB and does not create a scan event for a failed decode.
- Imports are idempotent by `id` and do not interpret `value` as a number (leading zeros are preserved).
- Automatic tests cover invalid records, corrupted JSON Lines, markup payloads (handled as text), duplicate IDs and import size.
- GitHub Actions job is restricted to `contents: read` and its action revisions are pinned.

## Important unresolved risks (must be addressed before production)

### Dependency and supply-chain risk: HIGH
`html5-qrcode@2.3.8` loads at runtime from jsDelivr **without Subresource Integrity**. Pinning a package version alone does not authenticate each byte of the script. Prefer a verified, audited and locally hosted bundle with checksums, or add a vetted exact SRI hash that is checked against the deployed resource. Review transitive dependencies and set up dependency scanning. A CSP that allows jsDelivr cannot by itself eliminate malicious JS served from that origin.

### Persistence and integrity: HIGH
The current `localStorage` design rewrites the entire history on every new scan, with limited capacity, no transaction isolation across tabs and no crash-proof durable outbox. A `storage` event listener informs other tabs but **does not solve concurrent writes**. For volume/offline use, migrate to IndexedDB and add a server-side ingestion service.

### Authorization and privacy: HIGH
No login, user or device identity, tenant isolation, encrypted-at-rest backend, central audit trail, or access control. Scanned QR codes may contain URLs, personal data, access tokens or sensitive identifiers. Define classification, minimization, retention, purge and lawful-processing procedures before real customer data is used. HTTPS protects transport, **not access to data already stored in the browser**.

### Hosting headers: HIGH
Meta CSP is defense in depth but cannot replace HTTP response headers. Configure on the actual hosting/proxy:
- `Content-Security-Policy` including `frame-ancestors 'none'` (not supported in meta).
- `Strict-Transport-Security` only where HTTPS is configured and all relevant hosts are ready.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- Appropriate `Permissions-Policy`; test camera use before tightening it.
- Request/body limits, TLS certificate monitoring and access controls if externally exposed.

### Input, storage and operational risks: MEDIUM/HIGH
- Local older records failing strengthened validation may be skipped at load. Export and audit existing backups **before** merging this branch.
- A 5 MiB JSON Lines file and 20,000 records are bounded, but parsing and sorting still happen in the UI thread; migrate high-volume work off-thread.
- User cancellation, camera API support, focus, barcode symbologies and offline CDN access require physical-device tests.
- No centralized monitoring, incident response, backup retention, recovery test or supply-chain/vulnerability scanning pipeline yet.
- Sufficient CSP hardening requires removing inline HTML style attributes; `style-src 'unsafe-inline'` remains enabled for compatibility.

## Security release checklist
1. Verify hashes and origins of every runtime script; add SRI or self-host.
2. Run Node unit/CI tests and physical browser tests (Android/Chrome, iPhone/Safari, Windows/Chrome/Edge).
3. Validate HTML CSP behavior, including scanner dependencies and camera permissions, against real deployment.
4. Perform threat modeling, vulnerability scan, dependency audits and third-party review.
5. Define privacy/retention, authenticate identities, isolate tenants and authorize backend operations.
6. Test migrations, offline recovery, concurrent scans, PostgreSQL backup/restore and performance at anticipated scale.

Do not describe this prototype as production-secure until these gates have been satisfied.
