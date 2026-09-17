# 字段簿 FieldBook · 二开路线图：面向国内校招的简历自动填充

> 上游：[CoolSpring8/fillo](https://github.com/CoolSpring8/fillo)（MIT）。remote `upstream` 保留，便于 cherry-pick 上游修复。
> 上游定位是海外 ATS（Greenhouse/Lever/Ashby/Workday），本分支改造目标：国内校招表单（Moka / 北森 / 大易 / 牛客 / 企业官网）+ 中文字段 + 简历附件上传 + 投递记录回写。

## 设计前提

字段簿用 `FieldSlot` 做中间层，DOM 匹配与 profile 取值解耦：

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

## 本轮二开重构（2026-09-17，计划 `.plan/2026-09-17-二开重构计划.md`）

定位调整：主链路从「AI 分析页面」改为「**字段字典 → 确定性匹配 → 直接填值**」，**AI 降级为可选增强并默认关闭**。

| 阶段 | 内容 | 状态 |
|---|---|---|
| 0 | 改名 Fillo → **字段簿 FieldBook** | ✅ 完成 `61185b1` |
| 1.1 | provider 增加 `none`（默认），`isAiEnabled()` 单闸门收口全部 AI 入口 | ✅ 完成 `8770285` |
| 1.2 | 入门清单重排（档案必做 / AI 可选），AI 选项归入 Advanced 并标注不支持中文 | ✅ 完成 `7b7fb7f` |
| 1.3 | **PDF 规则抽取（零 AI）**：`shared/pdf/ruleExtract.ts`，导入 PDF 的第三条默认路径 | ✅ 完成 `51a8b69`（附带修掉 schema 不允许 `meta.custom` 的假校验警告 `39ddf53`） |
| 1.4 | 清理死代码与未引用文案（删除 auto 模式残留；i18n 637 → 522 键） | ✅ 完成 `e833e41` |
| 2 | 字段字典数据化（编辑 + 导入导出 + 热生效） | 🟡 **数据层 + 热生效已完成** `15cb2f3` `79d8035`（方案 A，见 `.plan/2026-09-17-阶段2-字段字典设计.md`）；编辑 UI 与导入导出入口未做 |
| 3 | 字典扩容到 150+ 中文标签 + 真实站点语料 | ⏳ 未开始 |
| 4 | 多方案简历库 / 附件 | ⏳ 未开始 |
| 5 | 投递记录 | ⏳ 未开始 |
| 6 | 脱离 fork 建独立仓库 | ⏳ 未开始 |

### 本轮的关键取舍

- **AI 默认关闭**：`ProviderKind` 增加 `'none'` 且 `DEFAULT_SETTINGS.provider = { kind: 'none' }`，装完不再引导去下几 GB 的本地模型。所有 AI 调用收口在 `background.ts` 的 `isAiEnabled()` 一处，未启用时返回 `{ status: 'disabled' }`；content 侧把它当作「静默无建议」而不是错误，避免每敲一个字弹红错。
- **PDF 导入提供三条路**：规则快速抽取（推荐，零 AI）/ 使用 AI 解析（未配置模型时禁用并说明）/ 仅保存文件。
- **规则抽取的边界**：以「标签锚定」为主（宁可少抽也不抽错），如实返回 `hits` / `misses`。唯二例外是民族与政治面貌——中文简历常写成 `男 | 1999-03-12 | 汉族 | 中共党员` 不给标签，因此用 56 个民族白名单 + 政治面貌枚举在**开头的个人信息块内**匹配（放开到全文会把正文的「服务群众」「家族企业」读成个人属性）。教育经历首行也支持「日期 学校 专业 学历」这种无标签写法。
- **`meta.custom` 是国内扩展字段的通道**，`jsonresume-v1.json` 必须放行它（且不能把 `additionalProperties` 放开成 `true`）。改 `jsonresume-v1.json` 后**必须**重编译 `jsonresume-v1.validate.cjs`，命令见 `AGENTS.md`。


## 字段字典（阶段 2）

字段知识只有一份来源：`shared/dictionary/defaults.json`（匹配模式 + 枚举同义词 + 下拉选项）。曾经它同时存在于 `adapters.ts` 的正则、`value.ts` 的枚举表、`cnProfile.ts` 的选项常量三处，改一处忘一处就静默漂移。

- **模式格式**：`{ match, mode }`，`mode ∈ substring | exact | prefix | suffix | regex`。实测 305 条模式里 226 条是纯子串，只有 79 条真的含正则元字符，所以正则只当逃生口。literal 模式比较时双方小写化，等价于旧的 `/x/i`。
- **编译期保护**：坏正则只失效这一条并记进 `issues`，不让整份字典加载失败；正则剥掉 `g`（`exec` 的 `lastIndex` 会跨次漏匹配）；literal 模式不接受空串。
- **读取方式**：`getDictionary()` 同步返回模块级缓存，匹配热路径不碰异步 storage。任何失败（storage 里是垃圾、解析不出结构）都退回内置字典，`hydrateDictionary()` 永不 reject。
- **热生效**：storage 键 `dictionary:v1`。background 与 sidepanel 各自 `hydrateDictionary()` + `watchDictionaryStorage()` / `subscribeDictionary`；content script 不订阅（它只执行填值）。改字典不需要重新打包扩展。
- **导出 / 导入 / 重置**：`exportDictionary` / `importDictionary` / `resetDictionary` 已就绪；**还没有 UI 入口**（阶段 2 只做数据层，未动界面）。
- **回归防线**：`tests/fixtures/legacy*` 冻结了改动前的旧表作为 oracle，`equivalence.test.ts` 用旧匹配逻辑与新实现在同一批约 1500 个探针上逐条比对；`defaults.sync.test.ts` 既是生成器（`WRITE_DICTIONARY=1`）也是同步守卫，手改 JSON 会被打回。


## 关键实现说明

- **匹配策略**：`matchSlotWithAdapters` 按「最长命中优先」决策（同长时保留声明顺序）。上游的「首个命中」会把「紧急联系电话」判给 `phone`、「专业排名」判给 `educationField`。
- **枚举归一化**：`expandEnumValue` 把值展开成中英同义候选，填充器用候选集匹配页面 option 文案（中英双向）；`normalizeEnum` 保留为单向旧接口。两张表都读字典的 `enums` / `synonyms`。
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
- **Chrome 内置模型只支持 `de / en / es / fr / ja` 五种文本语言，不支持中文。** `shared/llm/chromePrompt.ts` 统一以 `en` 声明 `expectedInputs` / `expectedOutputs`（当前 Chrome 强制校验，缺失即抛 `No output language was specified in a LanguageModel API request`），且 `availability()` 必须传与 `create()` 完全相同的参数。系统提示词全为英文、模型只原样搬运 profile 值，因此中文表单填充不受影响；但若将来要让模型**生成**中文文案（如开放题自述），本地模型不可靠，应改用 OpenAI / Gemini。
- `ProfileForm`（旧 JSON Resume 表单）里 certificates / languages / interests / references / publications / volunteer / work 段落没有对应的 CnProfile 槽位，编辑后不会落盘；中文专属字段请在「扩展字段」编辑器或 profile.json 里维护。
- 自定义下拉 / 日期选择器实现差异极大，失败时返回可读原因（编辑器会提示改用手动复制）。
