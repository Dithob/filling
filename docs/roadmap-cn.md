# 字段簿 FieldBook · 二开路线图：面向国内校招的简历自动填充

> 上游：[CoolSpring8/fillo](https://github.com/CoolSpring8/fillo)（MIT）。remote `upstream` 保留，便于 cherry-pick 上游修复。本仓库现已脱离 fork 独立，仓库名 `filling`（工程代号），产品名「字段簿 FieldBook」。
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
| AI | Gemini Nano / OpenAI / Gemini | **已收敛为 DeepSeek 一条链路，且只服务导入解析**；填表侧 AI 全删 |

## 阶段划分与进度

| 阶段 | 内容 | 验收 | 状态 |
|---|---|---|---|
| 0 | 环境跑通 + 真实站点实测产出缺口清单 | `pnpm build` 成功；`docs/gap-analysis.md` 成文 | 🟡 构建/类型/测试全绿；真实站点实测待用户登记 |
| 1 | 换中文精简 schema + profile.json 导入导出 | 扁平 profile 字段全部解析并填入 | ✅ 完成（含数据丢失修复） |
| 2 | 中文 slot 扩到 51 + 最长命中优先 + 枚举归一化 + custom 兜底 | 词典命中率 ≥95%（表驱动 + 负例集） | ✅ 完成 |
| 3 | 填充增强：file / contenteditable / date / Shadow DOM / 自定义下拉 + 只填空开关 | 测试台 `ats-cn.html` 全部填中 | 🟡 代码完成；走查清单见下节「阶段 3 走查清单」（12 项可勾选） |
| 4 | 简历库（IndexedDB 多份简历）+ 附件自动上传 | 任选简历成功上传 | ⏳ 本期用 `profile.sourceFile` 单份附件；多简历库未开始（见 `CnAttachments.resumeId` 注释指向的 `shared/storage/resumeFiles.ts`） |
| 5 | 投递记录导出（CSV / Markdown，手动粘进 Notion）+ 投递历史 | 导出文件可直接粘贴到 Notion 数据库 | ⏳ 未开始；方向已定：先做 CSV / 复制 Markdown，不引入 Notion 凭据 |
| 6 | 高亮打磨、e2e、i18n、manifest/README 国内化 | `pnpm compile` 无错，e2e 绿 | ⏳ 未开始 |

### 阶段 3 走查清单（测试台口径，可勾选）

自测台已经带**机器可读的期望值**，走查不必靠肉眼比对：`data-slot` ×44（期望命中的 FieldSlot）、`data-path` ×44（期望值在 `docs/testbed/fixtures/sample-cn-profile.json` 里的路径）、`data-check-group="stage3"` ×6（阶段 3 目标控件）。
操作：导入夹具 → 侧边栏「扫描」→「填写匹配字段」→ 回测试台看自检面板 `docs/testbed/lib/cn-check.js` 的通过率（它按 `data-path` 取值比对）。

| # | 走查项 | 夹具 | 期望 | 通过 |
|---|---|---|---|---|
| 1 | 枚举下拉（`<select>` ×7） | `forms/ats-cn.html` | 命中 label / value / 同义候选；无命中报 `no-option-match` 且**不得**清空已有选择 | [ ] |
| 2 | 单选组（radio ×2） | 同上 | 命中目标项；组内已有选中项时「只填空」应跳过 | [ ] |
| 3 | 富文本（contenteditable ×1） | 同上 | 写入整段文本；`execCommand` 不可用时回落 `textContent` | [ ] |
| 4 | 只读日期控件（readonly ×2） | 同上 | 点击后能在日期面板里选中目标日 | [ ] |
| 5 | 原生日期输入（`type=date` ×3） | 同上 | 按 placeholder 猜出格式后写入 | [ ] |
| 6 | 附件（`type=file` ×1） | 同上 | 8MB 上限内可写入并派发事件 | [ ] |
| 7 | 自定义下拉（`role=combobox`） | 同上 `data-check-group="stage3"` | 开面板后轮询到选项并点中真选项 | [ ] |
| 8 | Shadow DOM（open root） | `forms/shadow.html` | 穿透 open root 扫到并填中 | [ ] |
| 9 | 分步表单（3 步，字段用 `hidden` 切换） | `forms/wizard.html` | 跨步字段能否被扫到；当前需手动点「重新扫描页面」（缺口 GAP-1） | [ ] |
| 10 | 「只填空」开关 | 设置页「填充方式」 | 开启时已有值跳过并显示原因 `has-value`；**单字段手动填不带该标志，永远覆盖** | [ ] |
| 11 | 跨域 iframe 表单 | `forms/iframe-cross-origin.html` | 每帧独立扫描并上报 `frameId` | [ ] |
| 12 | 杂乱页面（无 label / 靠相邻文本） | `forms/messy.html` | 靠相邻文本与 aria 兜底命中 | [ ] |

**走查前先知道的空白**（实测，2026-09-18）：`ats-cn.html` 里 **checkbox 数量为 0**（`messy.html` 有 2 个，但无 `data-path`，不能机器断言）；**12 个表单里没有任何一个模拟「第二级选项异步加载」的级联下拉**（`setTimeout` / `MutationObserver` / `fetch(` 出现次数全为 0）。两项都登记在 `.plan/2026-09-18-优化方案-v2.md` 的 B4。

**走查时优先复现这三条已知缺陷**（见 `docs/gap-analysis.md` 的「代码审查已识别缺陷」）：BUG-1 自定义下拉假成功、BUG-2 级联下拉不等待、BUG-3 单选组「只填空」保护失效。

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
| 6 | 脱离 fork 建独立仓库（仓库名定为 `filling`） | 🟡 已在 GitHub 改名为 `Dithob/filling`，待点 Leave fork network 断开分叉网络 |

### 本轮的关键取舍

- **AI 默认关闭**：`ProviderKind` 增加 `'none'` 且 `DEFAULT_SETTINGS.provider = { kind: 'none' }`，装完不再引导去下几 GB 的本地模型。（2026-09-18 进一步收敛为「AI 只服务导入解析」，见上一节。）
- **PDF 导入提供三条路**：规则快速抽取（推荐，零 AI）/ 使用 AI 解析（未配密钥时先弹配置窗，不置灰禁用）/ 仅保存文件。
- **规则抽取的边界**：以「标签锚定」为主（宁可少抽也不抽错），如实返回 `hits` / `misses`。唯二例外是民族与政治面貌——中文简历常写成 `男 | 1999-03-12 | 汉族 | 中共党员` 不给标签，因此用 56 个民族白名单 + 政治面貌枚举在**开头的个人信息块内**匹配（放开到全文会把正文的「服务群众」「家族企业」读成个人属性）。教育经历首行也支持「日期 学校 专业 学历」这种无标签写法。
- **`meta.custom` 是国内扩展字段的通道**，`jsonresume-v1.json` 必须放行它（且不能把 `additionalProperties` 放开成 `true`）。改 `jsonresume-v1.json` 后**必须**重编译 `jsonresume-v1.validate.cjs`，命令见 `AGENTS.md`。


## 本轮：AI 收口到导入解析（2026-09-18，计划 `.plan/2026-09-18-AI收口到导入解析.md`）

用户反馈「扩展太臃肿」，臃肿集中在三处：设置页的 `AI（可选）` 区块（4 个单选 + 3 组凭据表单 + 本地模型下载进度条）、入门清单的 AI 项、以及填表侧依赖 AI 的按钮。本轮把 AI 从「一个设置主题」降级为「导入动作里的一个选项」。

提交：`9dc806d`（`refactor!:` 填表侧去 AI + 导入侧收口，50 文件 +2126/−3982）、`3b24ec6`（`docs:` 本文件与 quickstart / gap-analysis 同步）。验证：tsc 0 错 · vitest 23 文件 / 258 用例全过 · 产物 3.45 MB。

| # | 改动 | 落点 |
|---|---|---|
| 1 | 设置页删掉整个 AI 区块、导航项与入门清单 AI 项 | `options/App.tsx`、`GettingStartedSection.tsx`；删 `ProviderCard.tsx`、`CopyHelperAffix.tsx` |
| 2 | provider 收敛：`none \| on-device \| openai \| gemini` → `none \| deepseek` | `shared/types.ts`、`storage/settings.ts`；删 `llm/chromePrompt.ts`、`llm/openai.ts`、`llm/gemini.ts` |
| 3 | 填表侧 AI 全删（悬浮 type-ahead、字段分类、引导建议） | `background.ts`、`content/main.ts`、`sidepanel/App.tsx`；删 `guidedSuggestion.ts`、`classifySlots.ts`、`prompt.ts` |
| 4 | 新增 CnProfile Schema + 解析提示词 + 校验修复一轮 | `shared/schema/cnProfile-v1.json`、`llm/resumeParse.ts`、`llm/resumeParsePrompt.ts` |
| 5 | 凭据入口内联进导入弹窗，不再是设置页区块 | `options/components/AiParseSettingsModal.tsx` |

### DeepSeek 的三条硬约束（决定了实现形态）

1. **`response_format` 只支持 `json_object`，不支持 `json_schema`。** 所以「让模型吐出规则能完美适配的 JSON」**不可能靠服务端强约束**，只能三段式：提示词内的形状示例 → 客户端 AJV 校验 → 失败把报错**回喂修复一轮**。见 `shared/llm/resumeParse.ts`。
2. **prompt 里必须出现 "json" 字样并给出目标形状**，否则模型会持续吐空白直到撞上 token 上限；`max_tokens` 也必须显式给足，截断的 JSON 是无效的。
3. **thinking 模式默认开启。** 结构化抽取要显式关掉（`thinking: { type: 'disabled' }`），并且只解析 `choices[0].message.content`——`reasoning_content` 是思维链不是答案。

默认模型名是 `deepseek-flash`（`deepseek-v4-flash` / `deepseek-chat` / `deepseek-reasoner` 已退役或弃用）。接新厂商只需在 `shared/llm/openaiCompatible.ts` 加一个 preset + 在 `ProviderKind` 扩一个字面量——它们都兼容 OpenAI 的 `/chat/completions` 协议。

扩展页面的 `fetch` 在 `host_permissions` 覆盖下**不受 CORS 同源策略约束**（那是针对普通网页的限制），所以直连 `api.deepseek.com` 不需要 `declarativeNetRequest` 改写 `Origin`。

### 为什么单独建 CnProfile schema，而不是复用 JSON Resume

国内校招字段（民族 / 政治面貌 / 身份证 / 籍贯 / 紧急联系人 / 英语水平 / 排名 / 培养方式 / 实习时长 / 研究方向）在 JSON Resume 里只能塞进 `meta.custom` 这个自由字典，**模型根本不知道要填什么**；而且落库还要多过一次**有损** `cnProfileBridge`（`work[0]` 被丢弃、projects 用 `·` 拼回字符串）。直接产出扁平档案 → 直接 `mergeCnProfileData` 落库，路径最短、信息无损。

**枚举不写进 schema**：枚举的唯一来源是 `shared/dictionary/defaults.json` 的 `options` 段，由 `resumeParsePrompt` 在**构建提示词时动态注入**。这样「改了字典，AI 的输出契约自动跟着改」，不会出现两份清单各自漂移。`cnProfile-v1.json` 只约束字段名与类型（`additionalProperties: false` 挡住模型凭空造字段）。

### 留档：本地模型链路的教训（代码已删）

Chrome 内置模型只支持 `de / en / es / fr / ja`，**不支持中文**；`availability()` 必须传与 `create()` 完全相同的参数，`expectedInputs` / `expectedOutputs` 曾必须以 `en` 声明，否则抛 `No output language was specified in a LanguageModel API request`。将来若要重新引入本地模型，先读这段。

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
- **AI 解析**：`shared/llm/resumeParse.ts` 编排「一次解析 → `validateCnProfile` → 不合格回喂报错修复一轮」。只读 `message.content`、忽略 `reasoning_content`；结果走 `mergeCnProfileData`（merge 语义，不会清空既有字段），并**强制删掉**模型可能编造的 `attachments.resumeId`——它指向本地简历库条目，编出来的 id 会让附件上传指向不存在的文件。

## 约定

- UI 文案必须进 `locales/en.yml` + `locales/zh-CN.yml`，改后 `pnpm install` 或 `node scripts/run-wxt.mjs prepare` 重生 i18n 类型
- 改 `shared/schema/cnProfile-v1.json` 后**必须**重编译校验器，命令与 `jsonresume-v1.json` 同形（换文件名即可）：
  `node node_modules/ajv-cli/dist/index.js compile -s shared/schema/cnProfile-v1.json -o shared/schema/cnProfile-v1.validate.cjs --spec=draft7 -c ajv-formats`
- 校验器的报错文案由 `shared/validate.ts` 的 `formatErrors` 统一生成，`additionalProperties` 会**点名**出问题的键（`/basic/nickName is not allowed.`）——AI 修复轮依赖这个键名才能告诉模型该删哪个字段
- 扩展 API 用 `browser.*` 命名空间（WXT 封装），不用 `chrome.*`
- 提交信息遵循 Conventional Commits
- 测试台：`python -m http.server 5174 --bind 127.0.0.1 --directory docs/testbed`，夹具 `docs/testbed/fixtures/sample-cn-profile.json` 可直接导入扩展

## 已知限制

- closed shadow root 无法穿透，这类控件扫不到。
- `ProfileForm`（旧 JSON Resume 表单）里 certificates / languages / interests / references / publications / volunteer / work 段落没有对应的 CnProfile 槽位，编辑后不会落盘；中文专属字段请在「扩展字段」编辑器或 profile.json 里维护。
- 自定义下拉 / 日期选择器实现差异极大，失败时返回可读原因（编辑器会提示改用手动复制）。
