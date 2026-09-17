import type { GeneratedI18nStructure } from '#i18n';
import type { FieldSlot } from './slotTypes';
import { getDictionary } from '../dictionary/store';
import type { CompiledAdapter, CompiledAdapterMatchers, CompiledPattern } from '../dictionary/types';

type ZeroSubstitutionKey = {
  [K in keyof GeneratedI18nStructure]: GeneratedI18nStructure[K]['substitutions'] extends 0 ? K : never;
}[keyof GeneratedI18nStructure];

export interface FieldLabelAdapter {
  id: string;
  /** 内置适配器的展示名走 i18n；导入的自定义适配器没有 i18n key，用下面的 label */
  nameKey?: ZeroSubstitutionKey;
  descriptionKey?: ZeroSubstitutionKey;
  label?: string;
  description?: string;
  matchers: CompiledAdapterMatchers;
}

/**
 * 内置适配器的展示名。
 *
 * 只有这一段还留在代码里：它是**界面文案**（i18n key 的类型约束靠它维持），
 * 而匹配用的词典已经全部搬进 `shared/dictionary/defaults.json`。
 * 从字典里导入的自定义适配器没有 i18n key，走 `label` / `description` 字段。
 */
const BUILT_IN_ADAPTER_META: Record<
  string,
  { nameKey: ZeroSubstitutionKey; descriptionKey?: ZeroSubstitutionKey }
> = {
  en_default: {
    nameKey: 'adapters.items.en_default.name',
    descriptionKey: 'adapters.items.en_default.description',
  },
  zh_cn: {
    nameKey: 'adapters.items.zh_cn.name',
    descriptionKey: 'adapters.items.zh_cn.description',
  },
};

function withMeta(adapter: CompiledAdapter): FieldLabelAdapter {
  const meta = BUILT_IN_ADAPTER_META[adapter.id];
  return {
    id: adapter.id,
    nameKey: meta?.nameKey,
    descriptionKey: meta?.descriptionKey,
    label: adapter.label,
    description: adapter.description,
    matchers: adapter.matchers,
  };
}

export function getLabelAdapters(selectedIds?: string[]): FieldLabelAdapter[] {
  const all = getDictionary().adapters.map(withMeta);
  if (!selectedIds || selectedIds.length === 0) {
    return all;
  }
  const set = new Set(selectedIds);
  const filtered = all.filter((adapter) => set.has(adapter.id));
  return filtered.length > 0 ? filtered : all;
}

export function listAvailableAdapters(): FieldLabelAdapter[] {
  return getDictionary().adapters.map(withMeta);
}

/**
 * 单条模式的匹配长度；0 表示没命中。
 *
 * 声明式模式一律**双方小写**再比，等价于旧写法 `/x/i`。旧表里所有含字母的模式
 * 都自带 `i`、且没有「无 i 但含大写」的模式，所以这一步不改语义
 * （由 tests/shared/dictionary/equivalence.test.ts 逐条比对保证）。
 */
function matchPatternLength(pattern: CompiledPattern, variant: string): number {
  switch (pattern.mode) {
    case 'regex':
      return pattern.regex?.exec(variant)?.[0].length ?? 0;
    case 'exact':
      return variant.toLowerCase() === pattern.needle ? pattern.needle.length : 0;
    case 'prefix':
      return variant.toLowerCase().startsWith(pattern.needle) ? pattern.needle.length : 0;
    case 'suffix':
      return variant.toLowerCase().endsWith(pattern.needle) ? pattern.needle.length : 0;
    case 'substring':
      return variant.toLowerCase().includes(pattern.needle) ? pattern.needle.length : 0;
    default:
      return 0;
  }
}

/**
 * 匹配策略：**最长命中优先**。
 *
 * 上游实现是「第一个命中的 slot 直接返回」，在中文标签上会系统性出错：
 * 「紧急联系电话」被 `phone` 的 /联系电话/ 抢先、「紧急联系人姓名」被 `name` 的 /姓名/ 抢先、
 * 「专业排名」被 `educationField` 的 /专业/ 抢先。改成按命中文本长度取最优，
 * 命中长度相同时保留声明顺序（稳定，不随遍历顺序抖动）。
 *
 * 字典换成 JSON 之后这条策略原样保留——它是这个项目最容易踩的坑，不能因为换数据源回退。
 */
export function matchSlotWithAdapters(text: string, adapterIds?: string[]): FieldSlot | null {
  const normalizedVariants = buildVariants(text);
  if (normalizedVariants.length === 0) {
    return null;
  }
  const adapters = getLabelAdapters(adapterIds);
  let bestSlot: FieldSlot | null = null;
  let bestLength = 0;
  for (const adapter of adapters) {
    for (const [slot, patterns] of Object.entries(adapter.matchers) as [FieldSlot, CompiledPattern[]][]) {
      if (!patterns || patterns.length === 0) {
        continue;
      }
      for (const variant of normalizedVariants) {
        for (const pattern of patterns) {
          const length = matchPatternLength(pattern, variant);
          if (length > bestLength) {
            bestLength = length;
            bestSlot = slot;
          }
        }
      }
    }
  }
  return bestSlot;
}

function buildVariants(input: string): string[] {
  if (!input || typeof input !== 'string') {
    return [];
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return [];
  }
  const stripped = trimmed
    .replace(/[：:]/g, ' ')
    .replace(/[（）()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lower = stripped.toLowerCase();
  return Array.from(new Set([trimmed, stripped, lower]));
}
