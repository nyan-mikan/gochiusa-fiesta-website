# D1 迁移

依次应用：0001_core（3NF 关系、版本与状态约束），0002_catalog（关闭的待配置活动、35 位作品角色和旁白），0003_integrity（角色引用约束、限流过期字段），0004_program_shape（临时节目必填形态），0005_administrator_management（账号权限版本、超级管理员能力与保护约束）。0006_submission_experience（私有文件、活动字典及其他说明），0007_official_character_colors（主要角色主题色），0008_script_entry_kinds（台词/注释/小标题，归档旁白并保留文字历史）。0009_wishes（祝福语文本、私有音频关联、独立开放开关及冻结约束）。本地、staging、production 使用同一结构。

```sh
npm run db:migrate:local
npm run db:migrate:staging
npm run db:migrate:production
```

先核对 wrangler.jsonc 的账户和 database_id。在已经使用的数据库上追加迁移，不能清库重新初始化，也不能直接修改已应用迁移实现升级。0001 的触发器 CASE 加括号属于首次远程应用之前发现的解析兼容修复，与本地 SQL 等价。

D1 batch 在断言/约束失败时整体回滚；不要通过删除 immutable 或 locked 触发器绕过业务冲突。角色归档与节目历史保留是设计要求。新增内置角色使用保留稳定 ID 的新迁移。
