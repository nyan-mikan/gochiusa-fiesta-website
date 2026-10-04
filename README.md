# Gochiusa New Year Fiesta · 点兔贺年祭

运行于 Cloudflare Workers 的投稿、审核、节目编排与实时主持稿工作台。
正式地址：https://usagi.mikanyan.com。当前基础版本已部署，征稿保持关闭。

已实现：邮箱验证码与可撤销会话、个人草稿、不可变投稿修订、管理员审核与通知队列、节目排序和锁定、主持稿逐句角色/自动保存/并发冲突/本地重放、稳定节目锚点、角色库与自定义列表、CSV/TXT 导出。

生产已接通网易 SMTP 发信，使用 gochi_fiesta@yeah.net，线上验证码发送已获得 SMTP 接受。页面使用维护者指定的 2027 点兔贺年祭文案及 Logo。超级管理员为 nyan_mikan@outlook.com。正式征稿仍需配置征稿窗口，并按当前 B 站投稿页核实分区职务。

## 本地运行

Node.js >=22.12。依赖固定在 package-lock.json。

```sh
npm ci
cp .dev.vars.example .dev.vars
# 在 .dev.vars 中设置随机 AUTH_CODE_SECRET（例如用 Node crypto.randomBytes 生成）。
npm run db:migrate:local
npm run build
npm run mailbox
# 另开终端：
npm run dev
```

访问 http://localhost:8787。本地邮件仅发送到 loopback 测试收件箱，不发送外部邮件。开发验证码可在 http://127.0.0.1:8025/messages 查看；这个端口不会部署到 Cloudflare。

初始化本地管理员：

```sh
node scripts/bootstrap-admin.mjs your-email@example.com local
```

本地默认活动关闭。登录管理员后在“活动设置”建立测试活动和明确标注的测试分区、职务。也可以运行集成测试自动创建独立的本地测试资料。

## 验证

```sh
npm run typecheck
npm run test:integration
npm run deploy:check:staging
npm run deploy:check:production
npm run smoke -- https://usagi.mikanyan.com
```

集成测试自行启动本地 Worker 和测试收件箱，需要 8787/8025 端口空闲；实际使用 workerd、D1 和 Durable Object，没有模拟账号认证或内存数据库。前端构建更新后须刷新页面；如 Wrangler 提示资源 watcher 不可用，重启开发服务。

## 部署与邮件

```sh
npm run build
npm run db:migrate:staging
npx wrangler deploy --env staging
npm run db:migrate:production
npx wrangler deploy --env production
```

生产 route 使用 Cloudflare Custom Domain `usagi.mikanyan.com`，生产关闭 workers.dev 和预览 URL。两套 D1、DO、认证密钥相互独立。AUTH_CODE_SECRET 已分别通过 Cloudflare Secrets 写入，不能放入 vars 或源码。`wrangler secret put AUTH_CODE_SECRET --env production` 用于轮换；轮换会使尚未验证的验证码失效。

发信适配器位于 src/worker/services/mail.ts。支持网易 SMTP、Cloudflare Email Sending、Resend、本地收件箱。生产使用 `MAIL_PROVIDER=smtp`、`SMTP_HOST=smtp.yeah.net`、`SMTP_USER=gochi_fiesta@yeah.net` 和相同的 `MAIL_FROM`，通过 TLS 465 端口连接；`SMTP_PASSWORD` 仅存为生产 Cloudflare Secret，使用 `wrangler secret put SMTP_PASSWORD --env production` 轮换。SMTP 使用 Workers 原生 TLS 连接交给 Nodemailer，保留证书验证、不记录凭据或邮件内容；使用固定业务 Message-ID，但 SMTP 不保证供应商幂等去重。staging 未启用这个生产邮箱。Cloudflare 模式需要该账户实际开通 Email Sending、验证发件域名及所需权限；未自动购买或升级套餐。Resend 模式需要验证发件域名、设置 `MAIL_PROVIDER=resend` 和 `MAIL_FROM`，用 `wrangler secret put MAIL_API_TOKEN --env production` 设置凭据，然后重新生成类型、检查、部署。设置应同时按需要应用 staging；不要把生产密钥复制到测试环境。

超级管理员已由维护者指定。该账号通过邮箱验证码登录后，在“管理员任免”中任命或罢免普通管理员。普通管理员没有任免权限，超级管理员账号在网页中受保护。权限改变会撤销目标的现有登录会话并保存审计记录。

新增超级管理员仅通过受控 CLI，不能从网页自助提权：

```sh
node scripts/bootstrap-admin.mjs nyan_mikan@outlook.com production super_admin
```

没有公开提权 API。初始化只预分配角色与能力，仍须通过真实邮箱验证码登录。通知消费者每两分钟运行，失败指数退避、最多六次、管理员可重试。`sent` 仅表示供应商接受，不能当作送达回执；目前未接入供应商送达 webhook。原生发信未提供业务幂等键保证，极端“供应商接受但写回失败”情况下可能重复投递；业务事件在 D1 中唯一。

## 数据与交付记录

- [3NF 数据库设计](docs/DATABASE_DESIGN.md)
- [Cloudflare 资源与配置](docs/CLOUDFLARE_ENVIRONMENT.md)
- [验证记录及限制](docs/VALIDATION.md)
- [验证码邮件与七天登录](docs/EMAIL_LOGIN.md)
- [角色目录来源](docs/CHARACTER_CATALOG.md)
- [原实施方案](IMPLEMENTATION_PLAN.md)

`.dev.vars`、node_modules、dist、.wrangler 均被忽略。运行环境受限时可设置 npm_config_cache、WRANGLER_LOG_PATH 到可写临时目录。`XDG_CONFIG_HOME` 的临时配置仅用于本地 Wrangler，远程命令需使用实际 OAuth 配置并允许读取 macOS Keychain。

## 投稿体验和文件上传

投稿已采用统一成员名单、原生时间选择器、视频时长识别及“其他”必填说明。角色库默认保留八个主要角色和旁白，并支持活动应援色覆盖。音乐、舞蹈、动画、影视、绘画、其他六个分区及制作职务作为活动预设内建，平台联投配置仍可以核实后建立新字典版本。

2026-10-04：维护者明确批准 R2 订阅后已激活，两套私有标准存储桶已创建并接入。当前使用 `npx wrangler deploy --config wrangler.jsonc --env production`（测试环境改 staging），作品文件上传及管理员祝福语音频功能已开放。R2 含免费额度，超额按量计费；没有升级其他套餐。[文件上传结构与验证](docs/UPLOADS.md)。
