# 主持稿语言审核

编辑主持稿后离开台词文本框，编辑器先确认台词已保存，再向本站后台登记该台词版本的审核。登记响应不等待外部服务，后台通过现有 ScriptRoom 的 alarm 执行；D1 队列和现有每两分钟定时任务负责唤醒未完成工作，不增加 Queue、数据库或付费 Cloudflare 服务。

每个 `line_id + line_version` 只对应一个随机 UUID。反馈永久保存在该 UUID 下，刷新、重新进入或重复失焦都读取原结果，不再请求模型。每则问题可以忽略，忽略按 UUID、问题编号、当前用户保存，其他编辑者仍可查看自己的提示。修改台词、发言片段、角色、条目类型或舞台提示后使用新的已保存版本；旧反馈和忽略记录保留，新版本不会继承它们。排序不修改台词版本，不重新审核。空台词不请求。未修改的重复保存不会产生新的版本。

单句还独立检查词语搭配、褒贬义与副词用法。英文专名、作品和节目标题按标准写法或标题式大小写校对，实词首字母大写，标题中间的连接词、冠词和短介词可小写；保留 OpenAI、iPhone、YouTube 等官方混合写法，不把普通英文句子、URL、邮箱或代码一律改为标题。未知专名不猜测官方拼写。另有整段逻辑、上下文与地点审阅，见 [SCRIPT_PARAGRAPH_REVIEW.md](SCRIPT_PARAGRAPH_REVIEW.md)；它使用独立的上下文标识，不更改单句的历史缓存。

反馈检查语病、语法和的地得/词性、错别字、生造词、公开主持语言得体、明显违背发言角色性格以及其他明确语言问题。得体标准明确包括粗口、辱骂、贬损、歧视、羞辱、威胁和不合场合的表达。后台对有效反馈合并有限的明显粗口规则，避免空结果漏掉这类问题；普通亲属称谓不会机械当作粗口。角色预设与判断边界见 [SCRIPT_CHARACTER_REVIEW.md](SCRIPT_CHARACTER_REVIEW.md)。提示原文、具体问题和修改建议；不自动改稿，不阻止保存、定稿或导出。黄色三角形警告加入左下角系统消息，可从消息定位台词。结果是建议，不保证穷尽所有语言错误；实际模型判断质量需用你选定的服务验证。

## 你需要填写的四项配置

在 Cloudflare 控制台找到 Worker `gochiusa-fiesta-production`，进入 **Settings → Variables and Secrets**，以下名称全部按 **Secret** 添加并保存/部署。这样地址和模型名称也不会出现在公开变量列表、前端页面或浏览器资源里。不要使用 `VITE_` 前缀，不要把 Key 发到聊天、提交到 Git 或写入 `wrangler.jsonc`。

| Secret 名称 | 填写内容 |
| --- | --- |
| `SCRIPT_REVIEW_API_URL` | OpenAI 兼容 **Chat Completions 完整 HTTPS 地址**，例如 `https://api.openai.com/v1/chat/completions` 或供应商给出的兼容地址。不要只填域名或 `/v1`，不要填 Responses 地址；不能带账号密码、查询参数或片段。 |
| `SCRIPT_REVIEW_API_KEY` | 你的模型服务 API Key，原样填写；这是模型服务的 Key，与 Cloudflare OAuth/登录无关。 |
| `SCRIPT_REVIEW_MODEL` | 供应商实际支持的准确模型 ID，按其文档填写；这里不预设或猜测模型名。 |
| `SCRIPT_REVIEW_REASONING_EFFORT` | `none`、`minimal`、`low`、`medium`、`high` 或 `xhigh`，选模型支持的值。`none` 或不设置会省略 `reasoning_effort` 参数；服务不支持思考强度时用 `none`。建议初始用 `low`，复杂度不足再调高。 |

供应商接口需支持 `messages`、`response_format: {"type":"json_object"}`、`max_completion_tokens`，以及选择的 `reasoning_effort`（不设置时无需支持它）。服务只支持自己特有的 `thinking` 字段时，不能将那个值直接填进本配置。请求最多 4096 个完成 token（包括模型计入其中的思考 token），单次最长 90 秒。高思考强度可能用尽该预算，建议先用短台词验证。

也可以在已登录 Wrangler 的本机终端依次执行，命令交互输入对应的值，无需 Cloudflare API Token：

```bash
npx wrangler secret put SCRIPT_REVIEW_API_URL --env production
npx wrangler secret put SCRIPT_REVIEW_API_KEY --env production
npx wrangler secret put SCRIPT_REVIEW_MODEL --env production
npx wrangler secret put SCRIPT_REVIEW_REASONING_EFFORT --env production
```

仓库已设置 `keep_vars: true`，后续部署会保留控制台添加且未在配置文件中声明的普通变量，避免覆盖维护者填写的审核配置；四项仍建议用 Secret 保存。Secret 默认由 Wrangler 保留，无需把值写入仓库。控制台的「更新 Wrangler 配置」是同步提示，不是运行错误。

本地调试可在已被 Git 忽略的 `.dev.vars` 中追加同名配置。生产只允许 HTTPS；仅 `development` 接受指向 loopback 的 HTTP，供模拟服务测试。不要把生产 Key 或 SMTP 秘密复制到云端开发环境。本地测试脚本已内置模拟接口和假的测试 Key，运行验收不需要任何真实模型配置。

## 成本与失败处理

不设每日请求上限。同一用户每分钟最多登记 30 个新标识，用于避免短时间重复提交；已有标识直接返回缓存，不占登记配额。模型调用由你的供应商计费。

缺少必要配置时任务留在队列，不发送任何模型请求，也不影响正常编辑。配置齐全后后台定时任务会继续处理。每个标识只有一次派发机会：网络、超时或返回结构错误时，不自动重发同一标识，避免发生“供应商已经计费但本站没收到响应”时重复费用。修正配置后，需要修改对应台词并保存来产生新标识再检查。没有问题的空反馈也是永久结果。

审核完成前修改台词不会等待它；迟到结果保存到原 UUID，下个版本不显示旧建议。多角色分段合并为一条完整台词校对，空白片段不会单独创建请求。不会发送账号邮箱、UID、其他投稿、整份主持稿或服务 Key 的任何前端副本；后台仅发送该条目的类型、正文、舞台提示，以及该审核标识冻结的已选角色性格预设和发言片段归属；角色用临时编号关联，不发送内部角色 ID。前端接口严格只返回标识、台词版本、结果状态、问题及用户忽略状态，过滤配置值，不返回模型名、地址、Key、供应商响应体或原始报错。所有读取、登记、忽略都要求主持稿模块权限与现有 CSRF 保护，忽略写入和队列登记在事务中复核会话和权限。

## 数据库和发布

新增迁移 `0016_script_language_reviews.sql`，仅创建审核、问题和忽略三张关系表及索引/约束，不改已有台词、账号或历史稿。首次发布该功能必须先应用这项迁移再部署代码。角色性格升级追加 `0017_language_speaker_context.sql`，为新审核增加冻结上下文及不可改写约束；已应用迁移不改写，旧审核结果不回填或重发。保持当前 production D1/R2/DO、SMTP、域名及定时任务。

开发环境可使用 `npm run db:migrate:local`；生产迁移属于发布操作，按仓库环境边界执行，不能将开发安装脚本用于远程生产迁移。配置后可用一条可修改的台词验证，在离开字段后等待结果、刷新、忽略、再刷新，最后修改正文验证新提示；不要为正式域名验收创建测试身份或发送真实测试邮件。

## 验证

`npm run test:integration` 接入 `scripts/script-language-checks.mjs`；`node scripts/private-key-browser-check.mjs` 接入 `scripts/script-language-browser-checks.mjs`。`scripts/script-language-fixture.mjs` 在 `127.0.0.1:8040` 模拟兼容接口，验证后台请求、慢响应期间编辑、五种问题分类、请求去重、刷新恢复、持久忽略、修改/迟到结果隔离、错误与配置保密，不向真实模型发送内容。运行测试需本地 8787、8025、8040 端口空闲。详细验收记录见 [VALIDATION.md](VALIDATION.md)。
