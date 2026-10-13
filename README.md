# ECDICT Revised

基于 [ECDICT](https://github.com/skywind3000/ECDICT) 官方基础版的非官方英汉词库修订版，提供 SQLite、CSV 和配套处理脚本。

采用 AI 辅助修订，重点处理误译、乱码、错别字、词性和词形说明，并拆分混写义项。

**版本：v0.1.1** · 数据更新：2026-10-13

## 数据概况

| 项目 | 数量 |
| --- | ---: |
| ECDICT 原版词条 | 770,611 |
| 当前词条 | 758,497 |
| 词形映射 | 57,647 |
| 共有词条的释义修订 | 68,593 |
| 新增词头 | 13,467 |
| 原版未保留的词头 | 25,581 |

直接对照[固定版本的官方 `ecdict.csv`](https://github.com/skywind3000/ECDICT/blob/82c9872576b23118d7c42e920c11beb77f510ae2/ecdict.csv)，统计最终净变化，纯大小写和首尾空白变化单列。未保留词头包括早期快照已缺失的 13,483 条和后续移除的 12,098 条。详细口径及哈希见 [UPSTREAM.json](UPSTREAM.json)。

## 修订示例

| 词条 | 原版释义 | 当前释义 |
| --- | --- | --- |
| double fare | 双程票 | n. 双倍票价, 双倍车费 |
| alacritously | [网络] 卑鄙地 | adv. 欣然地，乐意地；adv. 敏捷地 |
| drug driving | [法] 酒醉后驾驶 | [法律] 受毒品或药物影响的驾驶, 毒驾 |

## 下载与使用

从本仓库 Releases 下载 `ecdict-revised-v0.1.1.zip`，解压后使用：

- `data/ecdict.sqlite`：直接查询。
- `data/entries.csv`：词头、音标、中文释义。
- `data/aliases.csv`：词形到词头的映射。
- `data/verb-inflections.json`：17,436 个动词词形的原形与时态类型，可用于原词形/动词原形切换。

v0.1.1 新增 1,213 条词形映射、纠正 87 条旧映射，例如 `atoned`、`atoning` 均指向 `atone`。本次音标、中文释义和 SQLite 表结构保持原样。

完整数据通过 Release 附件分发。CSV 用电子表格打开时，请将各列按文本导入。字段结构和重建命令见 [SCHEMA.md](SCHEMA.md)。

使用 Node.js 24+ 校验解压后的文件：

```sh
node scripts/verify.cjs data/ecdict.sqlite --checksums SHA256SUMS
```

## 文档与许可

- [修订方法](METHODOLOGY.md)：流程、比较口径和已知限制。
- [数据格式与工具](SCHEMA.md)：查询、导出、重建和原版对比。
- [变更记录](CHANGELOG.md)：版本概况；逐条对照位于 `changes/`。
- [来源署名](ATTRIBUTION.md) · [校验结果](VALIDATION.json) · [提交纠错](CONTRIBUTING.md)。

基础 ECDICT 内容和配套脚本采用 MIT；新增中文修订采用 CC BY-SA 4.0。使用时保留相应署名与许可，详见 [LICENSE](LICENSE)。
