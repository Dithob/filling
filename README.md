# 字段簿 FieldBook

**用字段字典确定性填充国内校招表单。** 全部匹配在浏览器本地完成，毫秒级、可离线、不需要 AI。

> 上游是 [CoolSpring8/fillo](https://github.com/CoolSpring8/fillo)（MIT，为 Google Chrome Built-in AI Challenge 2025 而写，定位海外 ATS）。本项目把它改造成面向国内校招的形态：中文字段、字段字典数据化、默认零 AI。改造记录见 [`docs/roadmap-cn.md`](docs/roadmap-cn.md)。

## 它做什么

主流填表扩展把「识别页面字段」交给模型，代价是慢、要下载几 GB 的本地模型、结果还不确定。字段簿反过来：

```
页面字段 ──▶ 字段字典（数据，不是代码）──▶ 确定性匹配 ──▶ 直接填值
                                              │
                                    未命中且 custom 兜底也没解
                                              ▼
                                        才调 AI（默认关闭）
```

- **字段字典**存的是「中文标签 → 字段槽位」的规则，可在工作台里直接编辑、导入导出、改完立刻生效——遇到怪异标签不用等发版，甚至能把字段包分享给同学。
- **51 个字段槽位**覆盖校招常见项：政治面貌、籍贯、生源地、身份证号、紧急联系人、可实习时长、专业排名、培养方式……
- **填充器**支持 input / select / radio / date / contenteditable / Shadow DOM / 自定义下拉 / 文件上传，枚举值中英双向归一（「本科」↔ bachelor）。
- **AI 是可选增强**，不是必经之路。不配任何模型也能完成「导入简历 → 扫描 → 一键填满」全流程。

## 快速上手

> 面向使用者的完整流程（含排错速查、校招专属字段、测试台练手）见 [`docs/quickstart-cn.md`](docs/quickstart-cn.md)。

```bash
pnpm install
pnpm build                 # 产物在 .output/chrome-mv3
```

1. Chrome 打开 `chrome://extensions` → 右上角开启「开发者模式」→「加载已解压的扩展程序」→ 选 `.output/chrome-mv3`。
2. 扩展详情页点「扩展程序选项」进工作台，导入一份 `profile.json`（零 AI 依赖，规则匹配即可跑通）。
3. 打开一个投递页，点工具栏图标 →「打开侧边栏」→ 先「允许扫描」，再点「填写匹配字段」。

本地测试台（含 `ats-cn.html`，39 类中文标签 + 自检面板）：

```bash
python -m http.server 5174 --bind 127.0.0.1 --directory docs/testbed
# → http://127.0.0.1:5174/
```

## 开发

```bash
pnpm dev             # 热重载（Chromium 独立 profile）
pnpm test -- --run   # 单次 Vitest
pnpm compile         # tsc --noEmit
pnpm build           # 生产构建
```

**不要直接调 `wxt`。** `package.json` 里所有 script 都经由 `scripts/run-wxt.mjs` 包装，它通过 `--require scripts/restore-rmdir-semantics.cjs` 注入一个 rmdir 语义修复：某些沙箱文件系统会让 `fs.rmdir()` 在非空目录上静默成功，从而破坏 WXT 的 `removeEmptyDirs()` 并删掉刚生成的 `assets/`。在正常机器上该 shim 是 no-op。

改了 `locales/*.yml` 之后必须跑 `pnpm install` 或 `node scripts/run-wxt.mjs prepare` 重生 i18n 类型，否则 tsc 会报 key not assignable；`en.yml` 与 `zh-CN.yml` 必须同步改。

## 想扩能力改哪里

| 你想做的事 | 改这个文件 |
|---|---|
| 页面标签识别不到 | `shared/apply/adapters.ts` 词典 |
| 匹配对了但填不进去 | `entrypoints/content/fill.ts` |
| 填进去格式不对 | `shared/apply/value.ts` |
| 长尾开放题 | profile 的 `custom` 键值对 → `shared/apply/customFallback.ts` |
| 换/加简历字段 | `shared/schema/cnProfile.ts`（`profile.ts` 是唯一耦合 schema 的生产代码） |

缺口登记用 `docs/gap-analysis.md` 的 A/B/C/D 分类模板。

## 已知限制

- Chrome 内置模型（Gemini Nano）只支持 `de/en/es/fr/ja`，**不支持中文输出**。需要模型生成中文文案时请改用 OpenAI / Gemini。
- closed shadow root 无法穿透，这类控件扫不到。
- 8 个槽位（country / state / postalCode / currentCompany / currentTitle / currentLocation / currentStartDate / currentEndDate）能匹配到但当前无对应 profile 字段，填不出值。

## 与上游的关系

上游是 [CoolSpring8/fillo](https://github.com/CoolSpring8/fillo)。本仓库最初是其 fork，现已改名 `filling` 并脱离 fork 网络，成为独立仓库——`filling` 是工程代号，产品对外名称始终是「字段簿 / FieldBook」。`upstream` remote 保留，仅用于必要时 cherry-pick 上游修复。MIT 许可与原版权声明完整保留（见 [LICENSE](LICENSE)）。

## License

MIT
