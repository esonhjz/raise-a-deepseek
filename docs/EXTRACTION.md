# 本轮公开提取与进度快照

日期：2026-10-24。本轮内容已获提交与推送授权，最终提交和远端状态以 Git 为准；不进行 npm 发布。

## 提取内容

参考私有宿主记忆存储修复和 FTS 工程实现，选取下列平台无关部分：

- `src/internal/memory-db.cjs`：schema 3、JSON 事务导入、一致快照、revision、事务修改、FTS5 索引和候选。
- `src/sqlite-memory.mjs`：独立 ESM API；保存、纠正、遗忘、教学撤销、默认召回与可选影子比较。
- `examples/sqlite-memory.mjs`：仅合成内容、系统临时目录、运行后清理的离线示例。
- `tests/sqlite-memory.test.mjs`：跨实例持久性、联系人隔离、过期版本拒绝、并发写入、迁移及 FTS 等独立测试。
- `scripts/check-public.mjs`：只扫描 Git 管理或未忽略的候选文件，拒绝常见敏感路径、凭据格式、绑定账号和数据库产物。

源代码范围参考私有宿主 a814997；公开内容没有合并私有 Git 历史或读取运行数据。该私有版本号只用于说明来源，并不代表公开代码就是整个宿主。

## 公开适配

- 存储目录和联系人 key 由调用方提供，key 派生为内部哈希，不内置任何账号或本机路径。
- 去掉 QQ 专用的环境配置；检索模式通过构造参数传入。
- 影子统计通过可选回调返回，去掉宿主本地日志与联系人字段。
- 保留现有 JSON MemoryStore 与 CLI；SQLite API 独立命名，文档说明接口区别。
- Node 最低要求更新到 24，以支持本轮实际验证的内置 SQLite 路径；原项目运行环境要求发生变化。
- 原有记忆测试中的角色关系句替换成明确合成的资料室例句。

## 不在本次提取范围

QQ 账号/登录/连接器、DSH 配置与工具授权、专用客户端、媒体素材与发送、联网工具、自动日记、完整消息/经历时间线、跨库 outbox、部署脚本和导出恢复 CLI 均未复制。

真实聊天、记忆、日记、信件、图片、运行配置、数据库、恢复材料、原始评测输出和封存题均未复制。产品当前进度只保留脱敏文字说明，详见 [STATUS.md](STATUS.md)。

## 验证

在仓库根目录运行：

```bash
node --version
npm test
npm run demo:memory
npm run check:public
git diff --check
```

本轮验证环境为 Node.js 24.18.1。公开测试应为 27 项，示例不需要网络、模型或 DSH。私有宿主的 346 项测试与这 27 项不是同一测试集。

自动扫描只能发现已定义的格式，不能代替人工阅读。提交前仍需核对 diff 与新文件；推送是后续独立操作。

## 建议的提交摘要

`feat: extract SQLite memory core and update companion progress`

此说明保留的是准备提交时的操作记录；最终 commit 或 push 状态以 Git 为准。
