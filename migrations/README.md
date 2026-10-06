# D1 迁移

0016_script_language_reviews 追加主持稿语言审核、问题与逐用户忽略关系表，唯一约束固定台词版本和审核标识，触发器保护输入及终态反馈。只增加表/索引/约束，不更新现有台词或其他生产资料；首次部署语言审核代码前应用。配置与数据流见 [SCRIPT_LANGUAGE_REVIEW.md](../docs/SCRIPT_LANGUAGE_REVIEW.md)。

依次应用：0001_core（3NF 关系、版本与状态约束），0002_catalog（关闭的待配置活动、35 位作品角色和旁白），0003_integrity（角色引用约束、限流过期字段），0004_program_shape（临时节目必填形态），0005_administrator_management（账号权限版本、超级管理员能力与保护约束）。0006_submission_experience（私有文件、活动字典及其他说明），0007_official_character_colors（主要角色主题色），0008_script_entry_kinds（台词/注释/小标题，归档旁白并保留文字历史）。0009_wishes（祝福语文本、私有音频关联、独立开放开关及冻结约束）。本地、staging、production 使用同一结构。

```sh
npm run db:migrate:local
npm run db:migrate:staging
npm run db:migrate:production
```

先核对 wrangler.jsonc 的账户和 database_id。在已经使用的数据库上追加迁移，不能清库重新初始化，也不能直接修改已应用迁移实现升级。0001 的触发器 CASE 加括号属于首次远程应用之前发现的解析兼容修复，与本地 SQL 等价。

D1 batch 在断言/约束失败时整体回滚；不要通过删除 immutable 或 locked 触发器绕过业务冲突。角色归档与节目历史保留是设计要求。新增内置角色使用保留稳定 ID 的新迁移。

0013_private_key_login 新增账号公钥、领取验证码、一次性签名登录挑战及私钥登录会话关联。每账号只允许一把有效公钥，轮换保留旧公钥并撤销关联会话；不保存私钥，不改变既有 sessions 列，详见 [PRIVATE_KEY_LOGIN.md](../docs/PRIVATE_KEY_LOGIN.md)。部署新增认证代码前先应用此追加迁移。

0014_account_and_deletion 新增账号昵称、草稿删除标记和私钥识别用途。追加触发器限制每账号每活动一则新祝福语，保护已提交历史，禁止在已删除草稿上创建上传任务；既有数据保留，详见 [ACCOUNT_AND_DELETION.md](../docs/ACCOUNT_AND_DELETION.md)。

0015_modules_and_dictionary.sql：分区乐观版本、七个管理模块授权与约束。为已有管理员保留原模块，新管理员须由超级管理员分配；职务定义及现有业务内容不变。

0017_language_speaker_context.sql：为每个新审核标识增加不可改写的角色性格及片段发言归属快照。旧审核标识、正文、结果和忽略记录保留，不回填或重发。
