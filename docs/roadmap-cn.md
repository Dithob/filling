# 二开路线图：面向国内校招的简历自动填充

> 上游：[CoolSpring8/fillo](https://github.com/CoolSpring8/fillo)（MIT）。remote `upstream` 保留，便于同步上游修复。
> 上游定位是海外 ATS（Greenhouse/Lever/Ashby/Workday），本分支改造目标：国内校招表单（Moka / 北森 / 大易 / 牛客 / 企业官网）+ 中文字段 + 简历附件上传 + 投递记录回写。

## 设计前提

Fillo 用 `FieldSlot` 做中间层，DOM 匹配与 profile 取值解耦：

```
页面字段 --adapters.ts(正则词典)--> FieldSlot --profile.ts(resolver)--> 具体值
```

`profile.ts` 只吐出扁平的 `Partial<Record<FieldSlot, string>>`，因此**换 profile schema 不影响匹配引擎与侧边栏**，改造集中在取值层。

## 已核实的上游现状

| 能力 | 上游状态 | 本分支动作 |
|---|---|---|
| 注入范围 | `matches: <all_urls>` + `allFrames: true` | 够用，不动 |
| iframe 表单 | 每帧独立扫描并上报 `frameId/frameUrl` | 已支持，不动 |
| 字段高亮 | `overlay.ts` 已有 `showHighlight` | 增强为三色语义 |
| 多 profile | `shared/storage/profiles.ts` | 保留，改类型 |
| 文件存储 | `storeFile/getFileBuffer`（idb-keyval 存 ArrayBuffer） | **复用做简历库** |
| 记忆系统 | `shared/memory/store.ts`（手动填过的值优先） | 保留 |
| 本地测试台 | `docs/testbed/forms/*.html` | 扩充国内 ATS 风格 |
| file 控件填充 | `classify` 认得 `'file'`，但 `fill.ts` 无分支（会走 input setter 报错） | **新增** |
| contenteditable 富文本 | 不支持 | **新增** |
| Shadow DOM | `querySelectorAll` 不穿透 | **新增** |
| 中文 slot | 33 个，偏海外（缺政治面貌/籍贯/身份证/学历枚举等） | **扩到 ~60** |
| profile schema | JSON Resume（嵌套深、ajv 校验） | **换中文精简 schema** |
| AI | Gemini Nano / OpenAI / Gemini | 默认关闭，稳定后移除 |

## 中文精简 Profile Schema

见 `shared/schema/cnProfile.ts`（阶段 1 落地）。分组：`basic` / `education` / `intention` / `links` / `texts` / `attachments` / `custom`（兜底的「问题→答案」映射）。

## 阶段划分

| 阶段 | 内容 | 验收 |
|---|---|---|
| 0 | 环境跑通 + 真实站点实测产出缺口清单 | `pnpm build` 成功；`docs/gap-analysis.md` 成文 |
| 1 | 换中文精简 schema | testbed 中文表单全字段命中并填入 |
| 2 | 中文 slot 扩到 ~60 + 枚举归一化 | Vitest 词典命中 ≥95% |
| 3 | 填充增强：file / contenteditable / date / Shadow DOM / 自定义下拉 | 新增 mock 表单全部填中 |
| 4 | 简历库（IndexedDB）+ 附件上传 | 任选简历成功上传 |
| 5 | 投递记录 Notion 回写 + CSV 导出 | Notion 出现条目，CSV 可导出 |
| 6 | 高亮打磨、e2e、i18n | `pnpm compile` 无错，e2e 绿 |

## 约定

- UI 文案必须进 `locales/en.yml` + `locales/zh-CN.yml`，改后 `pnpm install` 重生 i18n 类型
- 扩展 API 用 `browser.*` 命名空间（WXT 封装），不用 `chrome.*`
- 提交信息遵循 Conventional Commits
