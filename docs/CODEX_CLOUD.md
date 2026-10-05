# Codex Cloud development environment

Repository: `nyan-mikan/gochiusa-fiesta-website` (private), branch `main`.

Create an environment in ChatGPT: **Work in → Cloud → Select environment → Create environment**. Select this repository and prepare it using Node.js 24. The install command is:

```sh
node scripts/cloud-setup.mjs
```

Verify with `npm run test:integration`, `npm run test:script-merge`, and `node scripts/file-dropzone-check.cjs`, then review the setup report and publish. For interactive preview, start `npm run mailbox` and `npm run dev`, and check `http://localhost:8787/api/health`.

Keep the environment private (**Only me**). Dependency installation needs the package-manager network preset. Local checks do not require a Cloudflare API token, production authentication secret, SMTP password, or production data. `.dev.vars` is generated locally and ignored by Git. Website hosting, domain, production D1/R2/DO, and SMTP remain on Cloudflare.

Creating the environment enables cloud development; it does not migrate this desktop conversation. `AGENTS.md` and the existing feature/validation documents provide the project handoff.

Official instructions: https://learn.chatgpt.com/docs/environments/cloud-environments

## Published environment — 2026-10-05

The environment `gochiusa-fiesta-website` has been created and published in the current account, with privacy **Only me**, the package-manager network preset, and no production credentials or extra network secrets. The checked-out configuration commit is `bcc8ba2e14dc3529ec9a7d139068053e4672f338`.

The actual cloud workspace used Node.js 24.19.0 and passed setup, typecheck, build, 337 local HTTP integration checks, 30 script reconciliation checks, 13 file-selection/drop checks, and 18 startup smoke checks. The tested install script and start instructions are saved in the environment. The website and its production resources remain on Cloudflare.

Open https://chatgpt.com/settings/codex-cloud to find the environment, or choose **Work in → Cloud** when starting development. Setup record: https://chatgpt.com/local/01a10ab4-1f85-721c-9961-d26cd79060bd .
