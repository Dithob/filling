# 真实投递页实测缺口清单（阶段 0 产出）

> 用法：装好扩展后跑真实投递页，把问题按下面分类登记。这张表决定下一轮词典与填充器的优先级。
> **每个字段一行**，测完一个站点复制一份表格，站点名做小标题。

## 准备

1. `node scripts/run-wxt.mjs build`（或 `pnpm build`）后，在 `chrome://extensions` 加载 `.output/chrome-mv3`。
2. 工作台导入简历：优先「profile.json 导入」（见 `docs/testbed/fixtures/sample-cn-profile.json` 的形状），或在旧表单里维护 + 「扩展字段」编辑器补充中文专属字段。
3. 打开目标投递页 → 侧边栏「重新扫描页面」→「填写匹配字段」。字段归属完全由本地字段字典决定（2026-09-18 起填表侧不再有 AI 分类入口）。
4. 逐字段对照下表登记。

## 分类说明

| 类别 | 含义 | 对应改动 |
|---|---|---|
| A 未识别 | 字段没被扫描到，或扫描到了但匹配不到 slot（侧边栏显示黄标/未映射） | 扩 `shared/apply/adapters.ts` 词典 |
| B 填不进 | 匹配正确，但填入后页面值没变（自定义下拉 / 富文本 / 日期 / 附件） | 改 `entrypoints/content/fill.ts` |
| C 格式错 | 填进去了但格式不对（日期、学历枚举、城市、薪资） | 归一化 / 同义候选表 |
| D 兜底 | 长尾开放题，希望走「问题 → 答案」表 | 往 `profile.custom` 加键值对 |
| E 误填 | 不该填却填了：只填空保护失效，覆盖了用户已选 / 已填的值 | `entrypoints/content/fields.ts` 空值判定 |
| F 交互缺陷 | 扩展自身页面的可用性问题（不改变目标页面的填值结果） | `entrypoints/options/` |

## 模板

### 站点：<名称 / URL>

| 字段名（页面原文） | 控件类型 | 类别 | 期望值 | 实际表现 | 归属 |
|---|---|---|---|---|---|
| 例：政治面貌 | select | A 未识别 | 中共党员 | 未出现在侧边栏 | 词典 |
| 例：毕业时间 | 日期选择器 | B 填不进 | 2027-06 | 提示「自定义控件没有弹出选择面板」 | 填充器 |

### 汇总

- 识别率：识别出 N 个 / 共 M 个
- 主要卡点：
- 优先级建议：

---

## 代码审查已识别缺陷（2026-09-18 登记，待修）

> 来源：`fill.ts` / `fields.ts` / `cnProfileBridge.ts` / 选项页代码复核 + 用户实际使用反馈（拿截图问「档案不能改名吗」「字段为什么都是英文」）。
> 不是站点实测结果，故单独成节。修完请把对应行删掉或标注已修，别让这张表失真。

| # | 现象 | 类别 | 位置 | 期望 | 实际表现 | 归属 |
|---|---|---|---|---|---|---|
| BUG-1 | 自定义下拉「假成功」 | B 填不进 | `entrypoints/content/fill.ts:204-227` | 值真的选进组件 | 非 readonly 的 combobox 先直写 `input.value`，随后**同步**判非空就返回成功，从不开面板选真选项 → 带搜索框的 Ant/Vue Select 把它当未提交的搜索词，内部并未选中 | 填充器 |
| BUG-2 | 级联下拉不等待 | B 填不进 | `entrypoints/content/fill.ts:262-278`；`entrypoints/sidepanel/App.tsx:442-461` | 第二级在选项加载完成后填中 | `fillSelect` 是同步函数，无命中即 `no-option-match`、无轮询；批量填充的 `for` 循环内 `sendMessage` **无任何 await**，N 条一次全发 → 省市区下一级必然失败 | 填充器 |
| BUG-3 | 单选组「只填空」保护失效 | E 误填 | `entrypoints/content/fields.ts:374-388` | 组内已有选中项则跳过 | 空值判定看**该控件自身**的 `checked`，组内未选中的 radio 仍算「空」→ 批量填会去点它，可能改掉用户已选的其他选项；未勾选的 checkbox 同理会勾上 | 空值判定 |
| BUG-4 | 档案（方案）名没有改名入口 | F 交互缺陷 | 写入点仅 `entrypoints/options/hooks/useProfilesManager.ts:547-563` + `CnProfileJsonCard.tsx:66-82`；展示 `ProfilesCard.tsx:114` | 能改方案名 | `profile.name` 只在创建那一刻被写一次（新增档案硬写「新方案」；导入 json 用文件名）；卡片只渲染成一行 `<Text>` + 一个删除按钮。表单里的「姓名」编辑的是 `basics.name`（本人姓名），不是方案名 | 选项页 |
| BUG-5 | 「扩展字段」编辑器暴露 22 个英文保留键 | F 交互缺陷 | 根因 `shared/schema/cnProfileBridge.ts:349-369`；渲染 `ProfileForm.tsx:1605-1681` | 只列用户自定义的「问题 → 答案」 | 桥接层借 `meta.custom` 承载 JSON Resume 没有槽位的国内字段，键沿用 CnProfile 的英文存储键名（`hometown` / `englishLevel` / `ranking` / `fullTime` / `position` / `researchDirection` …）。面板文案「键会直接和表单标签比对」诱使以为 `hometown` 会匹配「籍贯」——实际匹配是「页面标签整体包含自定义键」，英文键命不中中文标签。**行为还不一致：改值生效、删行无效** | 选项页 / 桥接层 |

修复批次见 `.plan/2026-09-18-优化方案-v2.md`：BUG-1/2/3 → C1-1/C1-2/C1-3（先写用例再改代码）；BUG-4 → C0-1；BUG-5 → C0-2。

---

## 待补充

- [ ] Moka 系（moka.hr / 各公司 careers 页）
- [ ] 北森（beisen / 招聘官网）
- [ ] 牛客（nowcoder 校招）
- [ ] 大易 / 智联 / 前程无忧
- [ ] 企业自建官网表单

## 当前已知覆盖（自测台口径，供对照）

自测台 `docs/testbed/forms/ats-cn.html` 覆盖 39 类中文标签 + 枚举下拉 + 单选组 + 富文本 + 只读日期 + 自定义下拉 + Shadow DOM + 附件；
词典命中率由 `tests/shared/apply/adapters.test.ts` 表驱动断言（≥95%，含负例集）。真实站点若出现词典外的标签，按 A 类登记即可增量补。
