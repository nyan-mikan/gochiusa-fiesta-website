# 数据库设计：Cloudflare D1 / 3NF

2026-10-05。可执行结构是 migrations/0001_core.sql，角色和关闭活动初始化是 0002_catalog.sql，补充完整性约束和限流过期时间是 0003_integrity.sql；0004_program_shape.sql 显式约束临时节目的必填字段，避免 SQLite NULL CHECK 语义遗漏。0005_administrator_management.sql 追加账号权限版本和 user_capabilities，保留既有用户及外键。0006_submission_experience.sql 新增文件上传及其他说明字段，0007_official_character_colors.sql 更新官方主题色。0008_script_entry_kinds.sql 为主持稿条目增加受约束的 kind（台词、注释、小标题），归档旁白并保留历史引用。0009_wishes.sql 新增祝福语及独立音频关系与开放开关。0010_automatic_script_blocks.sql 增加自动节目段落与开场位置。0011_script_character_catalog.sql 恢复维护者指定的三位主持角色。0012_dialogue_segments.sql 增加台词发言片段及片段角色关系。共 40 张业务/辅助表，D1 migrations 表由 Wrangler 维护。

## 实体与依赖

| 关系组 | 表 | 主要依赖及约束 |
| --- | --- | --- |
| 身份 | users, user_capabilities, auth_challenges, sessions, rate_limits | user_id → 当前邮箱/角色；验证码挑战 → 受密钥保护摘要/有效期；session_hash → user_id；不存会话明文 |
| 活动 | events | event_id → 名称/年份/时区/征稿窗口；版本用于乐观并发控制 |
| 职务字典 | bili_categories, bili_role_options | category_id → 分区资料；option_id → 分区/职务/字典版本/证据；定义列不可变，历史投稿通过 FK 保留精确名称 |
| 投稿 | submissions, submission_revisions | submission_id → 活动/所有者/业务状态；(submission_id,revision_no) → 版本作品资料/当时反馈邮箱；不重复保存当前标题或当前修订 FK |
| 人员 | revision_people, revision_contacts, contributors | 人员属于特定修订；同修订同 UID 唯一；联系人、主上传账号与制作职务通过独立关系引用人员；复合 FK 保证人员不能跨修订引用 |
| 审核 | reviews | review_id → 修订/审核人/决定/原因；每个修订最多一次最终决定，撤回另存 reopen 事件 |
| 编排 | programs, program_items, program_history | 活动 ↔ 单一节目单；item_id 为稳定身份；引用精确已通过修订或自定义节目，两种形态 CHECK 互斥；排序不是身份 |
| 主持稿 | script_documents, script_blocks, script_lines, script_line_segments, script_segment_speakers, script_history | program_id ↔ 单一文档；block_id → 文档/稳定节目锚点；line_id → 段落/条目类型/发言角色/正文；文字版本与段落结构版本独立 |
| 角色 | characters, character_aliases, character_sources, character_lists, character_list_members, event_character_overrides | 角色身份、别名、来源、多对多列表分别存储；活动显示名/收藏/隐藏依赖 (event_id,character_id)；自定义角色限制活动作用域 |
| 提交记录 | operation_results, program_changes, export_snapshots, audit_logs | (actor,scope,operation_id) 唯一幂等结果；(program,seq) 唯一变更；正式导出按冻结节目版本和序号取快照 |
| 通知 | email_outbox | 独立业务事件键唯一；发送状态与审核状态分离；条件更新租约允许重试和多消费者协调 |
| 事务辅助 | transaction_assertions | 临时 CHECK 断言；不保存业务资料，成功事务删除，失败 batch 整体回滚 |

业务关系的非键属性直接依赖其候选键，没有将联系人、职务名称、角色别名或角色列表塞进逗号串。UID 使用 TEXT，绝不转换成 JavaScript Number。草稿允许人员 UID 为 NULL；正式提交应用层强制非零十进制 UID，并规范前导零。

修订内重复角色名称无需拷贝：引用不可变职务定义即可保留名称和字典版本，避免 `role_option_id → role_label` 的传递依赖。用户当前邮箱与“该修订提交时的反馈邮箱”是不同时间事实，后者是必要历史资料。用户全局资料也不用于覆盖历史 B 站名称。

历史、审计、幂等结果、变更和导出 JSON 是事件/归档内容，刻意保存当时结果，不能当作当前业务关系的第二套可编辑数据。节目标题、类型、时长和累计时间从引用修订或自定义条目计算；不在节目表重复保存投稿名称。`change_seq` 是事务提交计数器。

## 状态与一致性

草稿 → 待审核 → 通过/驳回。提交后修订及其人员关系由数据库触发器冻结。驳回后保存时创建新修订，重交时再次冻结。审核决定、状态、通知任务和审计在同一个 D1 batch 中提交。重复请求使用 operation_id；旧版本请求会触发 CHECK 并回滚整个 batch。

数据库拒绝编排未通过、跨活动或旧修订。已编排投稿不能退回修改；必须先移除节目引用，数据库触发器覆盖并发竞态。节目移除时段落锚点置空并保留台词，成为待重新定位段落。

每活动一个 Durable Object 序列化主持稿、编排和角色库写请求；服务器在 D1 batch 成功后才广播。每句正文版本、段落内结构版本和文档结构版本分开。D1 保存全量业务数据，DO 的 SQLite 仅用于运行协调/连接闹钟。

锁定编排后才能定稿主持稿；非空台词要求角色，注释与小标题无需角色；孤儿段落要求重新定位。正式导出保存不可变 JSON 快照；解锁节目编排清空当前定稿引用。旧快照仍可审计，不会冒充当前正式版本。

触发器内 `SELECT (CASE … END)` 使用括号规避 Cloudflare D1 远程 SQL splitter 的兼容问题。迁移在真实 staging/production 已验证，不只使用本地 SQLite。

## 管理员任免

基础角色仍为 users.role 的 submitter/admin。超级管理员拥有独立的 manage_admins 能力；(user_id,capability) 决定授权人和授权时间，API 的 is_super_admin 由关系实时计算，不额外存储重复布尔标志。能力仅能赋予未停用的管理员。数据库触发器阻止超级管理员降级或停用，网页只允许任免普通管理员，不提供提升为超级管理员的入口。

users.admin_version 是权限变更的并发版本：角色/能力变化由触发器递增。任免 D1 batch 同时检查操作者会话与能力、目标版本、角色修改、旧会话撤销、审计和幂等操作结果；失败整体回滚。账号尚未登录时可以预分配 admin，但 verified_at 保持 NULL，必须完成真实邮箱验证码登录。

## 投稿体验与私有文件（0006、0007）

新增三张表，保持 3NF：`uploads` 记录一个文件及对应投稿、R2 对象和上传状态；`upload_parts` 用 `(upload_id, part_number)` 标识一个分片，保存大小、校验摘要和 ETag；`revision_uploads` 用修订 ID 唯一关联完成的文件。文件所有者通过所属投稿推导，不重复存邮箱或用户角色。数据库触发器约束文件和修订必须属于同一投稿，且已提交修订的文件引用不能变更。

“其他”的具体节目类型、分区分别存于修订的 `type_other`、`category_other`，具体制作职务存在对应成员的 `role_other`，提交时服务端验证必填。负责人和主投稿账号继续通过 `revision_contacts` 引用同一份 `revision_people`，前端统一人员编辑，不重复输入身份。

分区及职务增加 `origin`，内建音乐、舞蹈、动画、影视、绘画、其他六个活动分区和对应创作职务，标注 `festival-default`，不冒充经过登录核实的 B站联投字典；现有 `verified_at` 仍只表达平台核实。管理员可建立后续平台字典版本，历史角色标签保持不可变。

活动角色覆盖增加可空 `color`。不覆盖时使用角色默认颜色；更改事件颜色继续采用版本检查、审计及 Durable Object 广播。归档支线角色保留历史引用。

## 主持稿条目类型（0008）

`script_lines.kind` 是由 line_id 决定的单值属性，CHECK 限定 dialogue/comment/heading；不创建重复的注释或标题文本表。类型、角色、正文和舞台提示共用行版本及幂等保存。应用层拒绝给非台词条目设置角色。目录直接从段落和小标题派生，不持久化第二份排序或标题。

旁白角色仅归档，不删除有外键引用的历史行。快照及导出将原旁白条目解释为注释，原文字和冻结历史保留。已经冻结的 JSON 缺少 kind 时仍兼容；新定稿仅对非空台词要求发言角色。

## 祝福语（0009）

`wishes.id` 决定活动、投稿者、署名、正文、状态和时间；`wish_audio.wish_id` 决定单份语音对象的键、名称、大小、类型、摘要。语音字节存入私有 R2，邮箱与账号权限通过 users 关系推导，不重复保存。`events.wishes_open` 是独立于作品征稿的活动属性。提交检查实时会话与角色，冻结后数据库拒绝更新正文或追加/删除音频。目录、列表和 ZIP 从已提交关系派生，不存第二份文本。

## 自动主持段落（0010）

`script_blocks.at_start` 区分真正开场，与结束位置及节目锚点互斥；`auto_generated` 表示由编排管理的段落。两个部分唯一索引分别保证每文档一个有效自动开场、每节目一个有效自动段落。节目通过既有 `before_program_item_id` 外键关联，自动标题在查询时从节目及其修订关系推导，显示顺序也从节目位置派生。自动段落存储通用占位标题，避免将可变节目名称作为第二套当前事实；段落 ID 和台词身份保持稳定。

节目保存、新活动创建、主持稿显式解锁时，缺失段落在既有 D1 原子 batch 内补齐，受版本检查、审计与幂等机制保护。读取快照不产生写入。移除节目时，空自动段落软归档；含条目的段落解除自动管理并保存当时节目名称作为历史锚点，保留所有文字，后续须重新定位或归档才能定稿。迁移仅补齐未锁定文档，冻结快照和锁定文档不改变。

## 主持角色目录（0011）

按维护者指定恢复风衣叶冬优、神沙夏明、神沙映月，仍使用原有角色 ID、别名、颜色及历史引用。主持稿各角色选择器和导出选项按 stable_key 排列为智乃、心爱、理世、纱路、千夜、小惠、麻耶、冬优、夏明、映月、提比，活动显示名变更不影响顺序；自定义角色随后保持原有顺序。排序是前端展示规则，不新增重复的角色关系或排序字段。角色库基础顺序相同，其显式角色列表顺序及收藏优先规则保留。迁移递增变更序号使在线窗口重新读取角色目录，保留活动隐藏设置和冻结快照。

## 多人合说与分段台词（0012）

`script_lines.delivery_mode` 限定 single/segments。旧单人台词继续使用原正文和角色列；分段台词的父行正文为空、角色为 NULL，当前正文只存在 `script_line_segments`。segment_id 决定所属台词、顺序和文本；(line_id,position) 唯一。`script_segment_speakers` 用 (segment_id,character_id) 记录多对多发言关系，片段内角色排序唯一，不存角色名称或逗号串。一片段可由多人合说，一条台词可按顺序包含多个不同发言人的片段。API 的拼接正文是查询投影，不是第二份可编辑数据。

整句及其片段、角色关系共用台词版本，通过既有 DO 协调和 D1 原子 batch 保存；失败不部分更新。应用层验证角色的活动作用域、归档状态、唯一性及正文总长（5000 字符、最多 50 个片段，每片段最多 20 位角色）。既有归档角色引用可保留，新台词不可新选归档角色；旁白不可参与发言。数据库外键、位置唯一约束、形态检查及冻结触发器覆盖子关系。非空台词的每个非空片段在定稿时都必须指定角色。

拆分、合并及单人模式转换保留对应文本和发言关系。旧客户端不能用不包含片段的请求覆盖分段台词。正式导出快照保存片段与角色，按角色导出仅包含该角色参与的片段，合说仍标明共同发言人。已冻结的旧 JSON 与旧单人台词继续兼容；迁移不改写旧正文或旧快照。

模块权限与字典并发：0015 在 bili_categories 增加 version，module_grants 以 (user_id,module) 为主键关联 users，授权者为独立用户 FK。超级管理员能力仍在 user_capabilities 中，授权变更增加 admin_version。职务更新只创建新字典版本，原定义与投稿 FK 保留。详见 ERP_INTERACTIONS.md。

## 视频交付与补交（0019）

`upload_videos` 以文件 ID 为主键记录容器验证，文件的声明类型与实际验证结果是不同事实；`revision_deliveries` 以冻结修订 ID 为主键，关联已经验证的同投稿完整视频和补交时间。原修订及其交付关系保持冻结，补交关系也不可替换或删除。投稿版本统一用于审核、补交和资料写入，避免多个并发控制来源。补交不复制标题、人员、所有者或审核状态。支持待审核/已通过投稿补交，之后驳回修改时生成新修订，原补交历史仍可读。新增迁移不修改或清空既有数据；详细规则见 [UPLOADS.md](UPLOADS.md)。
