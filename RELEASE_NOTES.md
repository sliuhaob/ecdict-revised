# ECDICT Revised v0.1.1

动词词形映射更新，2026-10-13。

- 新增 1,213 条词形映射、纠正 87 条旧映射，总计 57,647 条。
- 修正 `atoned`、`atoning` 的原形映射，均指向 `atone`。
- 新增 `data/verb-inflections.json`，包含 17,436 个动词词形的原形与类型，供应用实现原词形/动词原形切换。
- 758,497 条词条的音标、中文释义及 SQLite 表结构保持原样。
- 提供完整 SQLite、CSV、映射差异、来源署名和 SHA-256 校验和。

下载 `ecdict-revised-v0.1.1.zip`，解压后使用 Node.js 24+ 校验：

```sh
node scripts/verify.cjs data/ecdict.sqlite --checksums SHA256SUMS
```

使用说明见 [README](https://github.com/sliuhaob/ecdict-revised#readme)。基础 ECDICT 内容与脚本采用 MIT，新增修订采用 CC BY-SA 4.0。
