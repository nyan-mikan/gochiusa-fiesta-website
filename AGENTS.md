# Gochiusa New Year Fiesta Website

This repository contains the Vue 3 / TypeScript frontend and Cloudflare Workers backend for https://usagi.mikanyan.com. Cloudflare D1 stores relational data, Durable Objects coordinate script edits, and private R2 stores uploaded work and wish audio.

## Setup and verification

- Use Node.js 24 (minimum 22.12), and install the pinned dependencies with `npm ci`.
- For a fresh cloud checkout run `node scripts/cloud-setup.mjs`. It creates a new local-only authentication secret if `.dev.vars` does not exist, applies local migrations, typechecks, and builds. It never copies production secrets.
- Validate changes with `npm run typecheck` and `npm run build`.
- For authentication, permissions, database, script coordination, or upload changes run `npm run test:integration`. It uses actual local D1/R2/DO and a loopback mailbox, requires ports 8787 and 8025 to be free, and needs no Cloudflare account credentials.
- For script reconciliation changes also run `npm run test:script-merge`. For file selection/drop handling run `node scripts/file-dropzone-check.cjs`.
- To preview: run `npm run mailbox` and `npm run dev` in separate terminals. The website listens on port 8787; the test mailbox on loopback port 8025.

## Product requirements

- Use plain Chinese interface text and the name “Gochiusa New Year Fiesta”. Keep page width consistent through the shared CSS variable.
- Preserve 3NF, immutable submitted revisions, ownership and administrator permissions, idempotency and optimistic concurrency.
- Wish text is required for every account. Administrators may add audio; pure audio wishes cannot be submitted.
- All file inputs support both native file selection and drag-and-drop. Preserve server size/type/permission checks; works have a 1,000,000,000-byte limit and wish audio a 20 MiB limit.
- In scripts, Enter inserts a new line; Ctrl/Cmd+Enter inserts a newline. Preserve immediate editing feedback, multi-speaker segments, annotations, headings, navigation, and automatic program-linked paragraphs.
- Consult `docs/VALIDATION.md` and the relevant feature document for existing behavior. The original implementation plan is historical; later explicit user requirements take precedence.

## Environment boundaries

- Development/testing defaults to local emulation. Never place production secrets, real OTPs, local databases, or user uploads in Git or task output.
- Production Cloudflare resources already exist. Environment setup does not require deployment, remote migrations, real email, or provisioning cloud services.
- Remote deployment/testing needs separately authorized access. Use the named staging/production environment and retain existing bindings; never copy production SMTP or authentication secrets into a development environment.
- Only free services or tiers may be enabled without new user authorization. Use portable temporary directories rather than macOS-specific paths.
