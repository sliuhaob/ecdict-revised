# 数据格式与工具

## SQLite

```sql
CREATE TABLE entries (
  word TEXT PRIMARY KEY COLLATE NOCASE,
  phonetic TEXT NOT NULL DEFAULT '',
  translation TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE aliases (
  alias TEXT PRIMARY KEY COLLATE NOCASE,
  target TEXT NOT NULL
) WITHOUT ROWID;
```

- `word`：词头；`phonetic`：音标，空字符串表示缺失。
- `translation`：中文释义，内含词性和领域标注；字面量 `\n` 可在展示时转成换行。
- `aliases`：词形到 `entries.word` 的映射，由验证脚本检查目标是否存在。
- `sqlite_stat1`：SQLite 内部查询统计。

查询顺序为词条优先、词形映射次之。`NOCASE` 主要处理 ASCII 大小写。

需要原词形/动词原形切换时，同时查询原词条和映射目标；原词条不存在时，可用原形释义展示该词形。

```sql
SELECT word, phonetic, translation FROM entries WHERE word = 'double fare';

SELECT e.word, e.phonetic, e.translation
FROM aliases a JOIN entries e ON e.word = a.target
WHERE a.alias = 'tipped';
```

本库采用简化字段结构；依赖上游 `definition`、词频、考试标签、`exchange` 等额外字段的应用需要适配。

## CSV

UTF-8，无 BOM，逗号分隔，CRLF 记录分隔。数据字段用双引号包围，内部双引号写成两个双引号；实际换行和字面量 `\n` 原样保留。

- `entries.csv`：`word,phonetic,translation`。
- `aliases.csv`：`alias,target`。

记录按键的 SQLite `BINARY` 顺序排列。用电子表格导入时将各列设为文本，避免 `= + - @` 等开头的内容被当作公式。

## 动词词形 JSON

`data/verb-inflections.json` 与 SQLite 放在同一目录，结构为：

```json
{"version":1,"source":"...","forms":{"atoned":[{"lemma":"atone","types":["d","p"]}],"atoning":[{"lemma":"atone","types":["i"]}]}}
```

- `forms` 的键为词形，值为原形候选数组；首项对应 `aliases` 的目标。
- `lemma` 为 `entries.word`；`types` 中 `p` 表示过去式、`d` 表示过去分词、`i` 表示现在分词。
- 同一词形可有多个类型或原形候选，各类型计数可能重叠。
- 当前收录 17,436 个词形，其中 8,812 个带过去分词类型、8,523 个带现在分词类型。
- JSON 按原文件随库分发；CSV 重建只重建两张 SQLite 表，需另将 JSON 放在新数据库旁。

## 变更清单

`changes/*.jsonl.gz` 为 gzip 压缩的 UTF-8 JSON Lines，每行一个对象，按键排序。

| 文件 | 内容 |
| --- | --- |
| `entries.jsonl.gz` | 新增和释义修订，`action` 为 `add` 或 `revise` |
| `deletions.jsonl.gz` | 原版未保留词条，含早期范围差异及后续删除，`action` 为 `delete` |
| `formatting.jsonl.gz` | 仅大小写或首尾空白变化，`action` 为 `format` |
| `summary.json` | 原版对比统计、哈希和匹配规则 |
| `history/aliases-vs-2026-09-13.jsonl.gz` | 相对本地中间版本的词形映射变化，供历史参考 |
| `aliases-vs-v0.1.0.jsonl.gz` | v0.1.1 相对 v0.1.0 的 1,300 条映射变化 |
| `v0.1.1.json` | 本次词形整理的统计与版本对照 |

词条记录含 `word`（匹配键）、`before` 和 `after`，前后对象保留原始三个字段。新增的 `before`、未保留条目的 `after` 为 null。映射记录使用 `alias,before,after`。

`history/aliases-vs-2026-09-13.jsonl.gz` 记录截至 v0.1.0 的历史变化；本次变化见 `aliases-vs-v0.1.0.jsonl.gz`。

原版词头以 `word.trim().toLowerCase()` 生成匹配键，再按 SQLite NOCASE 对接；释义与音标两侧以 `String.trim()` 区分内容和格式变化。归一化后词头冲突时，比较脚本报错。

## 导出、重建与验证

使用 Node.js 24+，命令在解压后的项目目录执行：

```sh
node scripts/verify.cjs data/ecdict.sqlite --checksums SHA256SUMS
node scripts/export.cjs data/ecdict.sqlite exported
node scripts/build.cjs data rebuilt.sqlite
node scripts/verify.cjs data/ecdict.sqlite rebuilt.sqlite
node --test scripts/test.cjs
```

导出目录和重建文件须为新路径。构建失败会保留输出文件供检查，重试时使用新路径。

对比原版时，下载[固定版本 CSV](https://raw.githubusercontent.com/skywind3000/ECDICT/82c9872576b23118d7c42e920c11beb77f510ae2/ecdict.csv)，保存为 `upstream-ecdict.csv`：

```sh
node scripts/compare-upstream.cjs upstream-ecdict.csv data/ecdict.sqlite upstream-comparison
```

核对输出 `summary.json` 的源文件哈希与 [UPSTREAM.json](UPSTREAM.json) 一致。

## 内容哈希

两张表分别按主键 `COLLATE BINARY` 排序，将每行字段按列顺序组成数组，以 JavaScript `JSON.stringify` 序列化并附一个 LF，再将 UTF-8 字节连续送入 SHA-256。

内容哈希用于验证重建后的逐字段一致性；`SHA256SUMS` 检验具体发布文件的字节内容。
