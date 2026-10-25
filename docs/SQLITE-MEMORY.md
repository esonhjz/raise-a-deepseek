# SQLite 记忆核心

这是从私有宿主独立提取的存储与候选检索模块。需要 Node.js 24，无第三方运行依赖。

## 最小用法

在仓库根目录运行以下示例，或运行 `npm run demo:memory` 使用自动清理的临时目录：

```js
import { SqliteMemoryStore } from './src/index.mjs';

const memory = new SqliteMemoryStore('./data/sqlite-demo', 'sample-contact');
const entry = memory.remember('喜欢墨绿色', {
  eventId: 'synthetic-message-1', subject: 'user', kind: 'preference',
});
console.log(memory.recallForPrompt('墨绿色'));
// ['联系人：喜欢墨绿色']

const snapshot = memory.load();
memory.removeById(entry.id);
try {
  memory.save(snapshot);
} catch (error) {
  console.log(error.message); // MEMORY_CONFLICT
}
```

目录与联系人 key 必须由可信宿主提供。key 经 SHA-256 派生为内部 contact_key；哈希用于命名和隔离，不提供加密或访问控制。不要把未经认证的聊天自称用作 key。模块不识别 QQ 号、不替宿主管理身份。

## 与旧 JSON API 的区别

| 项目 | MemoryStore | SqliteMemoryStore |
| --- | --- | --- |
| 存储 | 一个 key 一个 JSON | 同一目录共用 memories.sqlite，按 contact_key 隔离 |
| 写入 | 原子文件替换，简单单写者示例 | 事务修改；整快照保存需 revision |
| 确认候选 | confirm(id) | confirm() 确认最新候选 |
| 直接保存 | remember(text, {supersedes, source}) | remember(text, {eventId, subject, kind}) |
| 纠正 | 显式传旧 id | rememberUpdate；目前为关键词启发式 |
| 删除 | forget(id) | removeById(id)、forgetMatching、forgetTopic |
| 检索 | 字面匹配 | 默认字面匹配，另有 recallFts 候选接口 |

两种 API 不会自动互相替换。原有初始化、信箱和课堂示例继续使用原模块。

## 写入与状态

- `remember`、`rememberUpdate`、确认、遗忘、教学撤销在 `BEGIN IMMEDIATE` 后读取最新记录并修改。
- `load()` 返回 `{ version, entries, revision }`；条目与 revision 来自同一读快照。
- `save(snapshot)` 要求非负安全整数 revision。缺失/非法值报 `MEMORY_REVISION_REQUIRED`，旧版本报 `MEMORY_CONFLICT`。
- 状态包括 candidate、confirmed、superseded、deleted；只有 confirmed 参与默认召回。
- 保存确认不代表宿主验证了事实真伪。来源、主体和类别由调用方赋值，不构成额外工具授权。
- 一位联系人最多 2000 条记录；直接记忆正文上限 500 个 Unicode 字符。软删除和替代仍占记录数。

## 旧格式导入

首次初始化时支持宿主版本 1 的 `{version:1, entries:[...]}` JSON，文件名需为 `sqliteContactKey(key) + '.json'`。这是特定兼容格式，不会自动读取旧公开示例的 default.json 等命名文件。

导入在事务中保留 ID、未知字段、来源、状态和替代关系，完成后写幂等标记。错误数据会回滚；修复源文件后可重试。完成标记存在时不再读取旧 JSON，因此不能把更旧 JSON 放回目录作为恢复手段。

本轮未公开私有宿主的导出/verify/restore 工具。不要将运行中的 SQLite 主文件单独拷贝当作完整快照，WAL 也可能包含已提交数据。自行接入备份与恢复时需使用 SQLite 一致性备份方式。

## FTS 与影子回调

```js
const observed = new SqliteMemoryStore('./data/sqlite-demo', 'sample-contact', {
  retrievalMode: 'shadow',
  onShadow: metrics => console.log(metrics),
});
const promptRecords = observed.recallForPrompt('墨绿色'); // 仍返回 legacy 结果
const candidates = observed.recallFts('墨绿色');          // 单独取得 FTS 候选
```

影子回调包含查询长度、两套结果数量、ID 重叠数量、耗时和错误代码，不包含查询或正文。回调失败不影响正常召回；模块不读取私有环境变量，也不自动写影子日志。

FTS5 使用 trigram；一两个字的短查询有 LIKE 回退。它只是字面候选检索，不能处理所有同义词、代词或历史状态。派生索引通过触发器随事务维护。内部 `rebuildFts` 可重建，但内部 API 不保证稳定。

## 限制

- 纠正、主题遗忘和 sanitize 含词项启发式，可能误匹配；不能当作完整的来源级删除协议。
- 模块提供条数上限，不替宿主落实整个 prompt 的字符/token 预算。
- 记忆是明文落盘；soft delete 不抹除原文，也不会清理其他档案、日记、备份或服务端副本。
- 没有 QQ/DSH 连接器、自动经历抽取、自动日记、跨数据库 outbox 或统一恢复清单。
- FTS 在私有开发样本中没有支持替换 legacy 的质量证据。本模块测试只验证工程行为，不宣称回答质量提升。
