/**
 * 桥接层的「保留键」清单，以及它们在扩展字段编辑器里的呈现规则。
 *
 * 背景：`resumeFromCnProfile` 借用 JSON Resume 的 `meta.custom` 承载 CnProfile 的结构化字段
 * （民族 / 政治面貌 / 身份证号 / 籍贯 / 英语水平 / 专业排名 …），反向转换
 * `cnProfileDataFromResume` 再从这批 key 读回来。所以它们**不是**用户自己写的
 * 「页面问题 -> 答案」兜底项——ASCII 键名也命中不了中文表单标签（匹配规则是
 * 「页面标签整体包含自定义键」）。
 *
 * 单独成模块，是为了让两个消费者（桥接层、表单层）都只依赖这份清单，
 * 而不是让表单层反过来依赖桥接层的实现细节。
 */
import type { FieldSlot } from '../apply/slotTypes';

/**
 * 全部由桥接层借用的键。
 *
 * 三个集合的关系（`reservedCustomKeys.test.ts` 会守住这条划分）：
 * `RESERVED_CUSTOM_KEYS` = `STRUCTURED_FIELD_ORDER`（可在编辑器里改值） ∪ `EDITOR_HIDDEN_KEYS`（编辑器里彻底不出现）。
 */
export const RESERVED_CUSTOM_KEYS: ReadonlySet<string> = new Set([
  'nation',
  'politicalStatus',
  'idCard',
  'wechat',
  'qq',
  'hometown',
  'emergencyContact',
  'emergencyPhone',
  'englishLevel',
  'ranking',
  'fullTime',
  'position',
  'expectedCity',
  'expectedSalary',
  'availabilityDate',
  'internshipDuration',
  'jobType',
  'portfolio',
  'projectExp',
  'awards',
  'researchDirection',
  'resumeId',
]);

/** 键名两侧的空白先归一再判定，免得 `"hometown "` 这类写法漏过过滤。 */
export function isReservedCustomKey(key: string): boolean {
  return RESERVED_CUSTOM_KEYS.has(key.trim());
}

/**
 * 扩展字段编辑器里**永不出现**的保留键。两类：
 * - `position` / `projectExp` / `awards`：值另有结构化作者（`basics.label` / `projects` / `awards` 段落），
 *   表单每次保存都会覆盖这几个槽位，于是这里改的答案会被静默丢弃——留着只会骗人。
 * - `resumeId`：`attachments` 的内部存储键，本来就不是用户数据。
 */
export const EDITOR_HIDDEN_KEYS: ReadonlySet<string> = new Set([
  'position',
  'projectExp',
  'awards',
  'resumeId',
]);

export function isEditorHiddenKey(key: string): boolean {
  return EDITOR_HIDDEN_KEYS.has(key.trim());
}

/**
 * 可在编辑器里改值的保留键 -> 展示用的字段槽。
 *
 * 文案不重复造：直接复用 `locales/*.yml` 的 `slots.*`（见 `apply/slotLabels.ts`）。
 * `portfolio` 在填表时映射到 `website` 槽位（`apply/profile.ts`），但展示名要区分开，
 * 所以它的文案单独给（`slots.portfolio`），不在这张表里。
 */
export const STRUCTURED_FIELD_SLOTS: Readonly<Partial<Record<string, FieldSlot>>> = {
  nation: 'nation',
  politicalStatus: 'politicalStatus',
  idCard: 'idCard',
  hometown: 'hometown',
  wechat: 'wechat',
  qq: 'qq',
  emergencyContact: 'emergencyContact',
  emergencyPhone: 'emergencyPhone',
  englishLevel: 'englishLevel',
  ranking: 'educationRanking',
  fullTime: 'educationFullTime',
  expectedCity: 'preferredLocation',
  expectedSalary: 'expectedSalary',
  availabilityDate: 'availabilityDate',
  internshipDuration: 'internshipDuration',
  jobType: 'jobType',
  researchDirection: 'researchDirection',
};

/**
 * 编辑器里的展示顺序：身份信息 -> 学籍 -> 求职意向 -> 作品，也用作「补充字段」下拉的顺序。
 * 显式列出而不是靠对象键序，否则 `resumeFromCnProfile` 里加一行就会悄悄改变界面顺序。
 */
export const STRUCTURED_FIELD_ORDER: readonly string[] = [
  'nation',
  'politicalStatus',
  'idCard',
  'hometown',
  'wechat',
  'qq',
  'emergencyContact',
  'emergencyPhone',
  'englishLevel',
  'ranking',
  'fullTime',
  'expectedCity',
  'expectedSalary',
  'availabilityDate',
  'internshipDuration',
  'jobType',
  'portfolio',
  'researchDirection',
];

/** 排序用的名次；不认识的键排到最后（正常不会发生）。 */
export function structuredFieldRank(key: string): number {
  const index = STRUCTURED_FIELD_ORDER.indexOf(key.trim());
  return index < 0 ? STRUCTURED_FIELD_ORDER.length : index;
}
