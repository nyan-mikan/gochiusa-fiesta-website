# 作品文件交付

每个文件最大 **1 GB = 1,000,000,000 字节**。前端、Worker 和 D1 同时校验。视频在浏览器中读取元数据，上传完成后将时长向上取整到秒；无法解码或缺少时长元数据时，可使用时长选择器。

文件保存在独立的私有 Cloudflare R2 桶：

- 本地模拟：`gochiusa-fiesta-local-uploads`
- 测试环境：`gochiusa-fiesta-staging-uploads`
- 正式环境：`gochiusa-fiesta-production-uploads`

每片最多 10 MiB，通过经过登录、所属投稿和 CSRF 校验的 Worker 接口上传，不把整个文件放进 Worker 内存。分片编号、预期大小、SHA-256 和 R2 ETag 存在 D1，完成时以服务端清单校验总长度。支持分片重试、进度显示和取消。一个投稿同时最多三个进行中的任务；任务有效 24 小时。

新作品交付只允许视频，不再接受音频、图片、普通附件或预览链接。支持 MP4/M4V、MOV、WebM、MKV；单文件大小上限仍为 1 GB。原生选择和拖放使用同一限制。Worker 校验后缀与 MIME，再通过有界 R2 Range 读取核对容器结构、视频轨及媒体区域，拒绝纯音频、类型伪装和截断文件，不把整个视频读入内存。视频元数据最多 48 次 64 KiB 读取、1024 个容器元素；过于复杂的文件提示重新导出。文件名/MIME 不是验证凭据。

完成文件通过 `revision_uploads` 关联草稿的具体投稿修订；已提交修订的原文件引用不可修改。历史修订仍可下载原文件。文件不开放公共桶地址，下载仅限投稿所有者和管理员，支持 Range，并强制以附件提供，避免上传的 HTML 在站点执行。

每两分钟的清理任务分批回收超过七天、没有草稿/修订引用或补交记录引用的上传任务及文件。先在 D1 中将文件标记不可关联，再删除 R2 对象，防止回收与草稿保存并发导致引用失效。已关联作品不按此规则删除。

参考：[Cloudflare Workers multipart API](https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/)。


## 先投稿、后补交（0019）

2026-10-07：本地实现并验证，尚未上线。

不附视频也能提交完整的节目资料。视频尚未完成时先填写预计时长；联系人、署名、分区、职务等原有必填规则保留。提交确认提示可稍后补交，“我的投稿”和审核清单显示交付状态。

所有者可在待审核或已通过投稿的详情中上传缺失的视频；即使征稿关闭，也可补交。节目资料保持只读，视频上传控件独立于禁用的资料字段。上传完成后须点击右侧底栏的“提交视频”并确认；取消保留本页已上传文件，离开前提示尚未提交。手机支持原生选择/拖放和触控提交，不依赖 Enter。补交完成后刷新和历史修订查询均能取得同一文件；不能直接替换或删除已交付视频。更换须由审核流程退回，再创建新修订。

`upload_videos(upload_id,container)` 记录后端检查通过的文件。`revision_deliveries(revision_id,upload_id,created_at)` 保存一次性补交，不更新 `submission_revisions`、原始 `revision_uploads`、人员、审核决定或节目引用。文件所有者由投稿推导；无需重复存账号。补交与版本递增、审计、幂等结果在同一 D1 batch，检查本人、实时会话、当前修订、状态、文件完整性及所属投稿。旧版或并发操作失败整体回滚；重复成功请求返回原结果。审核页面旧版本也必须刷新后操作，不能忽略同时补交的视频。

清理任务在筛选、标记和删除时都排除补交文件，并由外键保护；未提交且没有任何引用的文件仍按七天规则回收。上传失败、取消、越权、1 GB 边界与 Range 下载规则保留。

0019 仅新增表/索引/约束，不回填或修改已提交历史；旧预览链接和附件仍在历史审核详情只读显示。已有合法视频在所有者保存/提交新修订时按实际文件验证一次，无需重新上传；旧的普通附件不能再次作为新投稿交付。新草稿表单不显示预览链接和提取码；草稿 API 拒绝非空链接/访问说明，已提交旧资料不自动改写。

部署新代码前必须先应用 `0019_video_deliveries.sql`。本轮仅应用本地迁移；没有执行 staging/production 远程迁移或部署。之前准备的头像功能仍独立等待公式照来源下载/核实。

## 当前开通状态

2026-10-04：说明超额计费后，用户明确同意 R2 订阅，已完成激活。上述测试及正式私有桶已创建，Standard 存储、apac 位置提示；公共 r2.dev 均关闭。两套 Worker 使用主配置 wrangler.jsonc 接入 UPLOADS，云端作品上传已启用。其他服务的免费限制没有改变。

2026-10-02：Cloudflare API 返回错误 `10042`，要求先在 Dashboard 开通 R2。已准备绑定、上传代码并通过本地 R2 模拟检查；云端桶创建和正式上传仍待账号开通。开通后创建上述测试和正式桶，再使用主配置部署。

本次已执行：

```sh
npx wrangler r2 bucket create gochiusa-fiesta-staging-uploads --location apac
npx wrangler r2 bucket create gochiusa-fiesta-production-uploads --location apac
npx wrangler deploy --env staging
npx wrangler deploy --env production
```

测试站 scripts/r2-staging-check.mjs 已通过 38 项真实云端检查，覆盖语音及作品私有桶访问、音频 ZIP、分片重试、完成、Range、权限拒绝和大小边界；实际完成 10 MiB + 27 字节作品文件，1 GB 通过声明并取消验证，未实际传输 1 GB。测试会话撤销、账号停用、活动关闭、完成的测试对象删除后才发布正式绑定。当前部署使用 wrangler.jsonc；wrangler.pending-r2.jsonc 仅为历史无存储备用配置。
