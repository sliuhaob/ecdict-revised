# ECDICT Revised v0.1.0

基于 ECDICT 官方基础版的非官方英汉词库修订版。数据截止 2026-10-07。

- 758,497 条词条，56,434 条词形映射。
- 相对原版修订 68,593 条共有词条的释义，新增 13,467 个词头。
- 原版未保留 25,581 个词头：早期快照缺失 13,483 个，后续移除 12,098 个。
- 提供 SQLite、CSV、逐条变更清单、来源署名和校验工具。

下载 `ecdict-revised-v0.1.0.zip`，解压后使用 Node.js 24+ 校验：

```sh
node scripts/verify.cjs data/ecdict.sqlite --checksums SHA256SUMS
```

采用 AI 辅助修订；比较口径和使用说明见 [README](README.md)。基础 ECDICT 内容与脚本采用 MIT，新增修订采用 CC BY-SA 4.0。
