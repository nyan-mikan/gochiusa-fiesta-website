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
