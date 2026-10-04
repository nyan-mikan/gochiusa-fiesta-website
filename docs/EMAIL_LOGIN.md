# 登录邮件与登录保持时间

2026-10-05。验证码邮件沿用点兔贺年祭的奶油底色、咖啡色品牌名与梅紫色验证码卡片，包含 Gochiusa New Year Fiesta。按维护者要求，标题为“登录验证码”，正文为“请在登录页面输入以下验证码，完成登录。”，移除修饰性欢迎语、旅程文案和邮件日文标语。六位验证码是完整连续文本，保留前导零，方便复制；明确 10 分钟有效。使用表格布局和内联样式，不依赖外部字体、远程图片、脚本或追踪像素。HTML 不受支持时有完整纯文本版本。

SMTP、Cloudflare Email 与 Resend 适配器均传递可选 HTML；收稿及审核通知仍沿用其原有纯文本内容。SMTP 生成 UTF-8 multipart/alternative，HTML 与纯文本验证码一致。官方字段说明：https://nodemailer.com/message。

登录保持时间此前已为七天；本次在 auth-policy.ts 集中定义 SESSION_TTL_SECONDS=604800，使 Cookie Max-Age 和数据库会话 expires_at 使用同一常量。服务器按登录创建时刻加七天计算绝对到期时间，不因刷新页面延期。HttpOnly、生产 Secure、SameSite=Lax、主动退出与管理员撤销会话规则保留。验证码有效期仍为十分钟，独立于登录保持时间。无需数据库迁移或延长既有会话。

验证：类型检查、生产构建和 225 项真实本地 HTTP 集成通过。所有实际本地验证码邮件均含 HTML 与纯文本的同一六位码；验证 Cookie 的 604800 秒、D1 创建至到期精确七天，并通过真实 API 确认过期会话返回 401。scripts/auth-email-check.mjs 使用离线 SMTP stream transport 检查两种 MIME 内容，并生成 docs/previews/login-code-email.html；不向外部收件人发邮件。

截图 screenshots/login-code-email-preview.png 是首版浏览器 HTML 预览，保留的是文案精简前的历史样式；当前文字以 docs/previews/login-code-email.html 为准。验证码 052713 为固定示例，不是有效登录验证码。不声称已核对真实邮箱的到达、Outlook 或其他邮箱客户端渲染。

已发布测试站与正式站；正式站发布后 18 项只读检查通过。临时预览页面和本地预览服务均已关闭。
