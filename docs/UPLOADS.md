# 作品文件交付

每个文件最大 **1 GB = 1,000,000,000 字节**。前端、Worker 和 D1 同时校验。视频在浏览器中读取元数据，上传完成后将时长向上取整到秒；无法解码或缺少时长元数据时，可使用时长选择器。

文件保存在独立的私有 Cloudflare R2 桶：

- 本地模拟：`gochiusa-fiesta-local-uploads`
- 测试环境：`gochiusa-fiesta-staging-uploads`
- 正式环境：`gochiusa-fiesta-production-uploads`

每片最多 10 MiB，通过经过登录、所属投稿和 CSRF 校验的 Worker 接口上传，不把整个文件放进 Worker 内存。分片编号、预期大小、SHA-256 和 R2 ETag 存在 D1，完成时以服务端清单校验总长度。支持分片重试、进度显示和取消。一个投稿同时最多三个进行中的任务；任务有效 24 小时。

完成文件通过 `revision_uploads` 关联具体投稿修订；已提交修订的文件引用不可修改。历史修订仍可下载原文件。文件不开放公共桶地址，下载仅限投稿所有者和管理员，支持 Range，并强制以附件提供，避免上传的 HTML 在站点执行。

每两分钟的清理任务分批回收超过七天、没有任何修订引用的上传任务及文件。先在 D1 中将文件标记不可关联，再删除 R2 对象，防止回收与草稿保存并发导致引用失效。已关联作品不按此规则删除。

参考：[Cloudflare Workers multipart API](https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/)。

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
