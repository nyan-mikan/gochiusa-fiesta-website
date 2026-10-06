# Cloudflare 资源与部署

部署日期：2026-10-02（Asia/Kuala_Lumpur）。compatibility_date 为运行时已支持的 2026-10-01。

账户 ID：b552cfd5f92c6a2c000494ad9b6d474a。使用已经恢复的 Wrangler OAuth 与 macOS Keychain；没有将 Cloudflare 登录凭据复制到项目。CLI 远程操作需要允许读取系统凭据。2026-10-04 按维护者明确授权激活 R2 含免费额度的按量计费订阅，未升级其他服务套餐。

| 环境 | Worker / URL | D1 database_id |
| --- | --- | --- |
| 本地 | gochiusa-fiesta-local / http://localhost:8787 | 无远程 ID |
| staging | gochiusa-fiesta-staging / https://gochiusa-fiesta-staging.nyan-mikan.workers.dev | 2dd9d0be-2e48-4ae1-8492-cc77893f1d3f |
| production | gochiusa-fiesta-production / https://usagi.mikanyan.com | 29305c64-b1fc-44f9-8ac4-b7d13bddcdb9 |

两套远程 D1 已完成 0001_core、0002_catalog、0003_integrity、0004_program_shape、0005_administrator_management、0006_submission_experience、0007_official_character_colors、0008_script_entry_kinds、0009_wishes、0010_automatic_script_blocks、0011_script_character_catalog、0012_dialogue_segments。40 张业务/辅助表，另有 Wrangler migrations 表。初始活动 fiesta-2026 征稿关闭。生产不含模拟投稿或测试登录用户；staging 保留已禁用测试身份、关闭测试活动及其审计资料。

Worker 静态资源与 Hono API 同源；run_worker_first=true，匿名工作台页面跳转登录，投稿者访问管理员页面/API 返回 403，未知 API 返回 JSON 404。生产使用 Custom Domain、关闭 workers.dev 与版本预览地址。

SCRIPT_ROOMS 类绑定已部署，每活动 getByName 使用独立协调对象；SQLite-backed 类迁移为 v1-script-room。业务数据留在 D1。定时触发器 */2 分钟处理通知队列和过期限流/验证码记录。`/api/health` 实际执行 D1 SELECT 1，返回泛化健康状态，不暴露资源标识。

AUTH_CODE_SECRET 为两个环境各自独立随机密钥，分别通过 Cloudflare secret bulk 写入。项目中无云端明文密钥；临时上传文件在完成后清理。MAIL_API_TOKEN 尚未设置。staging 的 MAIL_PROVIDER=unconfigured。生产使用 MAIL_PROVIDER=smtp、MAIL_FROM/SMTP_USER=gochi_fiesta@yeah.net、SMTP_HOST=smtp.yeah.net，通过 TLS 465 发信。SMTP_PASSWORD 已写入生产 Secret，临时上传文件已经删除，没有将该授权码复制到测试环境。

Cloudflare Email Sending 的账号查询返回 Unauthorized（code 2036），原因可能是权限或服务未开通；无法以此认定功能可用。已实现原生 Email Sending 适配器及 EMAIL binding，另可使用 Resend。生产已改用维护者提供的网易邮箱 SMTP：本机授权验证成功，线上 /api/auth/code 返回 200 且 SMTP 接受发往活动邮箱的测试验证码。最终送达未读取邮箱确认，不能把 SMTP 接受当作收件回执。无需开通 Cloudflare Email Sending。

维护者已经指定 2027 页面文案；超级管理员已按用户要求设置为 [管理员邮箱已隐藏]；尚需正式征稿窗口，通过设置页开放；六个活动分区及制作职务预设已内建，实际 B 站联投标签/上限仍需核实。初始化管理员 CLI 已提供；没有擅自将登录 Cloudflare 的邮箱当成活动管理员。

2026-10-04：维护者指定窗口后，在正式 D1 新建活动 fiesta-2027，名称“2027点兔贺年祭”、year=2027、Asia/Shanghai（UTC+8）、active=1、submissions_open=1、wishes_open=1。征稿开始 2026-10-04 00:00:00（存储 2026-10-03T16:00:00.000Z），结束 2027-01-06 23:59:59.999（存储 2027-01-06T15:59:59.999Z，包含 23:59 整分钟）。同时初始化 program-fiesta-2027 和 script-fiesta-2027，并写入来源为 authorized-maintenance-cli、actor_id=NULL 的真实维护审计，未伪造网站用户会话。原 2026 待配置活动保留。此时间窗口用于作品征稿；祝福语仍沿用独立 wishes_open 开关。

依赖：Node 22.23.1、Wrangler 4.146.0、TypeScript 6.0.3、Vue/Vite/Hono。package-lock.json 固定解析版本，npm audit 为 0 个已报告漏洞。

投稿体验更新前的 production 版本：53f15fbc-ad5e-41fe-b920-47fd8c78e4a9；staging 版本：69cf69c1-13bd-4bbc-ad78-2b12621b139b。基础开发完成时的生产只读检查：app_tables=32、characters=36、open_events=0、users=0；PRAGMA foreign_key_check 无异常。

2026-10-02 品牌更新：英文名统一为 Gochiusa New Year Fiesta；用户提供的原始 PNG 位于 public/images/gochiusa-new-year-fiesta.png，通过 CSS 裁掉画布留白，未重绘 Logo。图片作为匿名可访问的公开静态资源提供，桌面/390px 手机均已验证。

管理员任免：生产 [管理员邮箱已隐藏] 的 role=admin、manage_admins 能力已确认，admin_version=2、disabled_at=NULL；数据库外键检查无异常。账号预分配权限但未跳过邮箱验证。任免 API 与页面只对超级管理员开放，普通管理员即使直接访问也被拒绝；目标已有登录会话在权限变化时撤销。

R2：2026-10-04 已按维护者明确授权订阅并激活。创建 gochiusa-fiesta-staging-uploads 和 gochiusa-fiesta-production-uploads，两者使用 Standard 存储及 apac 位置提示，公共 r2.dev 访问已只读确认关闭。两套 Worker 已通过 wrangler.jsonc 接入各自的 UPLOADS 绑定，作品上传与管理员祝福语音频功能可用。

2026-10-04 授权经过：用户最初仅允许免费服务，检查计费页面后停在订阅前；用户随后明确回复“好的 我同意 你可以订阅”，据此同意 R2 条款和已登记付款方式的超额按量扣款，完成激活。今日基础费用显示 $0，免费额度为标准存储 10 GB-month/月、A 类操作 100 万/月、B 类操作 1000 万/月，超额收费；不承诺零账单。此前限制对其他服务仍适用。证据：screenshots/r2-activated.png、screenshots/r2-buckets-active.png。官方定价：https://developers.cloudflare.com/r2/pricing/。

当前正式版本：`e39a7908-b99f-4339-a61f-0d224e029854`；当前测试版本：`a9e1c786-823d-4505-aa0b-12cb5b91cf64`。两套 D1 已完成全部十二个迁移。此前正式只读核验：八个启用内建角色、六个活动分区、49 个分区职务选项，超级管理员能力有效，外键检查无异常。SQLite 表数量查询还包含 Cloudflare 元数据表；项目迁移实际创建 40 张业务/辅助表。

2026-10-05：验证码邮件启用 HTML 品牌卡片和纯文本双版本，生产继续使用既有网易 SMTP，未变更邮件凭据或发送外部测试邮件。七天 Cookie 与 D1 会话有效期集中定义并通过真实本地验证；此前保持时间也是七天。本地 225 项、测试站 60 项通过。两套 Worker 保留 R2 绑定，正式 2027 活动及其时间窗口没有改动。模板和预览说明见 EMAIL_LOGIN.md。

2026-10-05 文案更正：维护者要求正常直接表达，邮件标题改为“登录验证码”，正文为“请在登录页面输入以下验证码，完成登录。”。移除欢迎语、旅程文案和邮件日文标语，纯文本同步精简。只变更邮件文字；离线 HTML/纯文本 MIME 检查通过，已发布两套环境，七天登录与十分钟验证码有效期保留。

2026-10-05 SMTP 排查：线上 00:33 与 00:34 的错误为 EAUTH，失败发生在 SMTP 认证阶段，无法据此判断是授权码、认证方法还是供应商安全限制。维护者原授权码经本机 SMTP verify 成功，未发送邮件，未改云端凭据。随后维护者重试并确认收到验证码，当前恢复可用；未确定此前拒绝的具体触发原因。两套环境发布安全诊断字段（错误类别、数字响应码、白名单命令、归类原因），不记录原始 SMTP 回应、地址、授权码或邮件内容。

2026-10-02 追加修复：主持稿导出按 D1 角色归档/隐藏状态筛选；投稿表单分区整理；负责人与主投稿账号可取消且保持每种身份最多一人。无需数据库迁移。发布配置继续使用 wrangler.pending-r2.jsonc。

2026-10-02 主持稿同步更新：保存响应立即更新本地版本，保守三方合并减少无重叠冲突；键盘创建段落提供即时卡片、后台队列、本地恢复和幂等重试。此轮无需数据库迁移，继续使用 wrangler.pending-r2.jsonc 发布。

2026-10-02 按维护者更正移除新建段落快捷键，改为台词 Enter 新建下一句、Ctrl / ⌘ + Enter 换行；新台词即时可输入、后台创建及续存。line.add 可选 after_id 通过既有原子事务校验位置，兼容旧请求。无数据库迁移；发布配置仍为 wrangler.pending-r2.jsonc。

2026-10-02 主持稿类型与目录更新：0008 为条目追加 kind，旁白归档，旧文字和历史保留。支持台词/注释/小标题手动标记、即时目录、章节及小标题焦点跳转，注释及小标题无需角色即可定稿。测试站 50 项检查、正式域名 13 项 smoke 均通过；正式站 Script JS/CSS、Characters JS、models JS 四个资源逐字节匹配最终构建。继续使用 wrangler.pending-r2.jsonc。

2026-10-03 祝福语：0009_wishes 新增 wishes/wish_audio、独立开放开关，业务表共 38 张。文本投稿与管理员文本 ZIP 导出已上线。语音上传、播放、Range 下载与音频 ZIP 已通过真实本地 R2 与浏览器验证；账号 R2 两次查询仍返回 10042，线上继续使用 pending-r2 配置，语音入口明确待开通。测试站 60 项检查通过。开通后按 WISHES.md / UPLOADS.md 配置既有 UPLOADS 私有桶绑定，不需重写功能。

正式发布后 18 项 smoke 通过，7 个祝福语/设置/导航资源与最终构建逐字节一致。生产外键检查无异常，当前活动祝福语入口已开放；现有作品征稿开关未因新增功能而改变。

2026-10-05 默认活动：前端统一默认选择 fiesta-2027（2027点兔贺年祭），刷新后旧版缓存的占位活动选择重置一次，后续手动选择继续保留。类型及构建检查、默认选择运行检查通过，已部署两套环境。无需数据库迁移。

2026-10-05 工作台文案：按维护者要求只使用直接功能名称作为页头，去掉自拟抒情说明及装饰英文标题。同步精简投稿、祝福语和登录表单提示。两套环境已发布，无数据库或配置迁移。

2026-10-05 自动主持段落：两套 D1 应用 0010，自动补齐未锁定文档的「贺年祭开始」及现有节目段落。节目新增、改名、调序、移除通过现有 DO 串行协调和 D1 原子事务更新，已有文字保留。正式只读确认 script-fiesta-2026 与 script-fiesta-2027 各一个自动开场，节目段落无缺失、外键无异常；当前正式节目单为空，没有新增正式测试节目。250 项本地、85 项真实 staging、18 项正式 smoke 通过；两套环境共八个静态资源与最终构建逐字节一致。R2 及邮件绑定、活动窗口不变，无新增付费服务。

2026-10-05 主持角色顺序：按维护者要求，以稳定角色键将主持稿选项排列为智乃、心爱、理世、纱路、千夜、小惠、麻耶、冬优、夏明、映月、提比。0011 恢复冬优、夏明、映月，保留原颜色和历史引用；活动隐藏设置不变。两套环境已发布，本地 250 项与 staging 85 项检查通过，测试身份已撤销。正式 D1 十一位启用角色及 2027 活动隐藏状态核对完成、外键检查无异常。没有新增付费服务或发送真实测试邮件。

2026-10-05 多人合说及分段台词：两套 D1 已应用 0012，新增 script_line_segments / script_segment_speakers，原单人台词和已冻结快照不改写。整句子关系共用版本和原子事务；支持片段多人、顺序换人、即时添加输入、光标分段、复制、拆分/合并及完整/按角色导出。保留台词 Enter 新建和 Ctrl / ⌘ + Enter 换行。本地 306 项、真实 staging 141 项、30 项三方合并及正式 smoke 18 项通过；最终两套首页、主持稿 JS/CSS、模型 JS 共八个文件逐字节匹配构建。正式 D1 最新迁移和两张子表已只读核对，外键检查无异常。测试身份/会话停用、活动关闭，临时本地页面及服务停止。既有 D1、DO、R2、邮件绑定及活动窗口保留，未新增付费服务或发送真实测试邮件。

## 2026-10-05 两轮审查修复发布

本轮最终 staging 版本 `450e701e-9090-4b29-9195-25e3164b7617`，production 版本 `862516cc-1084-4ee7-b797-7767f900e8d5`。沿用 0012 迁移后的现有结构和全部绑定，没有新建服务、套餐升级或正式测试投稿。功能和 UX 修复及验收见 [AUDIT_FIXES_2026-10-05.md](AUDIT_FIXES_2026-10-05.md)。

统一页宽发布：staging `8b7a7763-a4e1-479a-8fb0-6adebd9cc57f`，production `ce6f3223-6822-4b70-b8cb-5eae793a3478`。仅页面布局调整，无数据库迁移或云资源变更。

文件拖拽上传发布：staging `f164a49f-981a-4abb-96c2-24d0222eac09`，production `4d1c366c-9a18-4026-b3ce-e6f76441ae2e`。作品与祝福语音频共用文件拖入/选择组件，沿用现有 R2 与上传接口，无数据库迁移或新增服务。

祝福语文字必填发布：staging `da94cb3b-0dbe-439a-826b-6a431a0782c7`，production `7ccb7607-ffe8-43d3-9f3f-72e4a047c6d5`。禁止管理员纯语音提交，前后端同时要求非空文字；无数据库迁移或云资源变更。本地 337 项、真实 staging R2 51 项通过，测试资源已清理。

2026-10-05 登录页与侧栏调整的最终 production 版本：`80cf4b4f-c7cb-4665-b1ef-a65bbc0b6169`。登录宣传区使用统一边距和圆角，账户卡片展开后显示退出按钮，悬停保持圆角；侧栏移除额外英文名称与工作台标签。通过 Wrangler OAuth 部署现有 Worker，沿用全部生产绑定，无新服务或迁移。最终线上 18 项 smoke 通过。

随后按维护者要求将正式待配置活动 `fiesta-2026` 停用：active 从 1 改为 0，version 从 1 改为 2，写入 source=authorized-maintenance-cli、actor_id=NULL 的 event/deactivate 审计。活动选择列表只保留 `2027点兔贺年祭`；原活动的 2 份投稿和 6 条主持稿保留，外键检查通过。`fiesta-2027` 状态和征稿窗口未修改。停用为生产数据操作，不需要代码部署或新的数据库迁移。

2026-10-06 私钥登录已正式发布：production 应用 `0013_private_key_login.sql`，新增账号公钥、领取验证码、签名登录挑战及私钥会话关联，保留既有业务表和数据。代码提交 `6e09f63`，生产版本 `9dfde7fe-7451-4821-87f5-3e251359e29d`，此前版本为 `80cf4b4f-c7cb-4665-b1ef-a65bbc0b6169`。Cloudflare Auth 通过 Wrangler OAuth 设备授权恢复，无 API Token 或生产秘密复制。本地 400 项集成及浏览器验证完成；正式常规 smoke 18 项、专项 19 项通过，登录 HTML 和九个相关资源匹配构建，生产外键检查和原有记录数量核对通过。既有 SMTP、D1、R2、DO、定时任务和域名绑定保留，无新增服务或套餐升级。staging 本次未变更。

2026-10-06 昵称及删除功能正式发布：代码提交 `cab4618`，当前 production 版本 `bcb68981-bcc5-4881-8c7d-2d2ee3518379`，前一版本 `9dfde7fe-7451-4821-87f5-3e251359e29d`。production 仅追加 0014，支持昵称、每账号每活动一则祝福语、本人未提交草稿删除、台词批量删除，以及私钥文件选择后隐藏选择区并确认账号。499 项本地集成和真实浏览器验收通过；正式域名常规检查 18 项、专项 47 项通过，HTML 和全部 31 个 JS/CSS 匹配构建。新字段、六个约束触发器、迁移记录和外键已核验，发布前后的用户/投稿/台词/祝福语数量一致。通过现有 Wrangler OAuth 发布，保持 production D1、DO、R2、SMTP、域名和定时任务；无新增服务或套餐升级，无生产测试身份、密钥或真实邮件，staging 未变更。详见 [ACCOUNT_AND_DELETION.md](ACCOUNT_AND_DELETION.md)。

2026-10-06 字段帮助及管理应用正式发布：最终代码 `38fff35`，production 版本 `2e4ebe93-5091-4574-991d-5ab918ac5977`，此前版本 `bcb68981-bcc5-4881-8c7d-2d2ee3518379`。仅应用 0015，新增分区版本、七模块授权及约束；现有 3 个启用管理员保留全部授权，新任命管理员须由超级管理员分配模块。输入框右侧双矩形帮助入口、编号/名称两列匹配弹层、E/W 消息框、独立分区职务应用及原子版本冲突检查均已上线，普通下拉菜单只保留原箭头。

557 项本地集成、30 项脚本合并、13 项文件选择/拖入与最终 Chromium 桌面/手机浏览器验收通过。线上常规 18 项、专项 55 项通过，HTML 和全部 35 个 JS/CSS 匹配最终构建；迁移记录、21 条初始授权、五个触发器、分区版本及外键已核验，发布前后原有用户、投稿、台词、祝福语和字典数量一致。通过现有 Wrangler OAuth 发布，保留 production 全部绑定与免费服务配置，无新服务、套餐升级、生产测试身份或真实测试邮件；staging 未变更。详见 [ERP_INTERACTIONS.md](ERP_INTERACTIONS.md) 和 [VALIDATION.md](VALIDATION.md)。
