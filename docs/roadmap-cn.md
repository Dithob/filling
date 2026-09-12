# 二开路线图：面向国内校招的简历自动填充

> 上游：[CoolSpring8/fillo](https://github.com/CoolSpring8/fillo)（MIT）。remote `upstream` 保留，便于同步上游修复。
> 上游定位是海外 ATS（Greenhouse/Lever/Ashby/Workday），本分支改造目标：国内校招表单（Moka / 北森 / 大易 / 牛客 / 企业官网）+ 中文字段 + 简历附件上传 + 投递记录回写。

## 设计前提

Fillo 用 `FieldSlot` 做中间层，DOM 匹配与 profile 取值解耦：

```
页面字段 --adapters.ts(正则词典)--> FieldSlot --profile.ts(resolver)--> 具体值
```

`profile.ts` 只吐出扁平的 `Partial<Record<FieldSlot, string>>`，因此**换 profile schema 不影响匹配引擎与侧边栏**，改造集中在取值层。

## 已核实的上游现状（基线）

| 能力 | 上游状态 | 本分支动作 |
|---|---|---|
| 注入范围 | `matches: <all_urls>` + `allFrames: true` | 已核实，无需改动 |
| iframe 表单 | 每帧独立扫描并上报 `frameId/frameUrl` | 已核实，无需改动 |
| 字段高亮 | `overlay.ts` 已有 `showHighlight` | 继续沿用 |
| 多 profile | `shared/storage/profiles.ts` | 保留，改类型 |
| 文件存储 | `storeFile/getFileBuffer`（idb-keyval 存 ArrayBuffer） | 已复用为附件来源 |
| 记忆系统 | `shared/memory/store.ts`（手动填过的值优先） | 保留 |
| 本地测试台 | `docs/testbed/forms/*.html`（11 个英文场景） | 新增 `ats-cn.html` |
| file 控件填充 | `classify` 认得 `'file'`，`fill.ts` 无分支 | **已新增** |
| contenteditable 富文本 | 不支持 | **已新增** |
| Shadow DOM | `querySelectorAll` 不穿透 | **已新增（open root）** |
| 中文 slot | 33 个，偏海外 | **已扩到 51** |
| profile schema | JSON Resume（嵌套深、ajv 校验） | **已换 CnProfile** |
| AI | Gemini Nano / OpenAI / Gemini | 保留为可选增强，规则匹配为主 |

## 阶段划分与进度

| 阶段 | 内容 | 验收 | 状态 |
|---|---|---|---|
| 0 | 环境跑通 + 真实站点实测产出缺口清单 | `pnpm build` 成功；`docs/gap-analysis.md` 成文 | 🟡 构建/类型/测试全绿；真实站点实测待用户登记 |
| 1 | 换中文精简 schema + profile.json 导入导出 | 扁平 profile 字段全部解析并填入 | ✅ 完成（含数据丢失修复） |
| 2 | 中文 slot 扩到 51 + 最长命中优先 + 枚举归一化 + custom 兜底 | 词典命中率 ≥95%（表驱动 + 负例集） | ✅ 完成 |
| 3 | 填充增强：file / contenteditable / date / Shadow DOM / 自定义下拉 + 只填空开关 | 测试台 `ats-cn.html` 全部填中 | ✅ 代码完成，待测试台人工走查确认 |
| 4 | 简历库（IndexedDB 多份简历）+ 附件自动上传 | 任选简历成功上传 | ⏳ 本期用 `profile.sourceFile` 单份附件；多简历库未开始（见 `CnAttachments.resumeId` 注释指向的 `shared/storage/resumeFiles.ts`） |
| 5 | 投递记录导出（CSV / Markdown，手动粘进 Notion）+ 投递历史 | 导出文件可直接粘贴到 Notion 数据库 | ⏳ 未开始；方向已定：先做 CSV / 复制 Markdown，不引入 Notion 凭据 |
| 6 | 高亮打磨、e2e、i18n、manifest/README 国内化 | `pnpm compile` 无错，e2e 绿 | ⏳ 未开始 |

## 关键实现说明

- **匹配策略**：`matchSlotWithAdapters` 按「最长命中优先」决策（同长时保留声明顺序）。上游的「首个命中」会把「紧急联系电话」判给 `phone`、「专业排名」判给 `educationField`。
- **枚举归一化**：`expandEnumValue` 把值展开成中英同义候选，填充器用候选集匹配页面 option 文案（中英双向）；`normalizeEnum` 保留为单向旧接口。
- **custom 兜底**：字段没命中任何 slot 时，用页面标签/上下文去 `profile.custom` 查答案（`shared/apply/customFallback.ts`），侧边栏标记为「自定义答案」。
- **附件填充**：侧边栏读 IndexedDB → base64 → `PROMPT_FILL` 下发 → content script 用 `DataTransfer` 写 `input.files`。上限 8MB。
- **只填空**：`AppSettings.fillMode`（默认 `emptyOnly`）只作用于批量「填写匹配字段」；手动点单个字段填入始终覆盖。

## 约定

- UI 文案必须进 `locales/en.yml` + `locales/zh-CN.yml`，改后 `pnpm install` 或 `node scripts/run-wxt.mjs prepare` 重生 i18n 类型
- 扩展 API 用 `browser.*` 命名空间（WXT 封装），不用 `chrome.*`
- 提交信息遵循 Conventional Commits
- 测试台：`python -m http.server 5174 --bind 127.0.0.1 --directory docs/testbed`，夹具 `docs/testbed/fixtures/sample-cn-profile.json` 可直接导入扩展

## 已知限制

- closed shadow root 无法穿透，这类控件扫不到。
- `ProfileForm`（旧 JSON Resume 表单）里 certificates / languages / interests / references / publications / volunteer / work 段落没有对应的 CnProfile 槽位，编辑后不会落盘；中文专属字段请在「扩展字段」编辑器或 profile.json 里维护。
- 自定义下拉 / 日期选择器实现差异极大，失败时返回可读原因（编辑器会提示改用手动复制）。
