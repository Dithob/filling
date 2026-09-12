/**
 * meta.custom（扩展字段）在「存储用的 Record」与「表单用的键值对数组」之间转换。
 *
 * 单独成模块是为了能在 node 环境下直接单测：ProfileForm 本身依赖 React/Mantine，
 * 而这几个转换是「中文专属字段会不会被保存清空」的关键路径。
 */
export interface CustomEntry {
  key: string;
  value: string;
}

type Recordish = Record<string, unknown>;

function isPlainObject(value: unknown): value is Recordish {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** meta.custom（Record）-> 编辑器用的键值对数组；空键/空值不保留。 */
export function parseCustomEntries(value: unknown): CustomEntry[] {
  if (!isPlainObject(value)) {
    return [];
  }
  return Object.entries(value)
    .map(([key, entry]) => ({ key: key.trim(), value: readString(entry) }))
    .filter((entry) => entry.key.length > 0 && entry.value.length > 0);
}

/** 编辑器键值对 -> meta.custom（Record）；空键/空值丢弃，避免写出无意义的兜底项。 */
export function customEntriesToRecord(entries: CustomEntry[] | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  for (const entry of entries ?? []) {
    const key = entry?.key?.trim() ?? '';
    const value = entry?.value?.trim() ?? '';
    if (!key || !value) {
      continue;
    }
    record[key] = value;
  }
  return record;
}

/** 按 key 合并扩展字段：两边都保留，incoming 的非空值覆盖 current。 */
export function mergeCustomEntries(current: CustomEntry[], incoming: CustomEntry[]): CustomEntry[] {
  const merged = new Map<string, CustomEntry>();
  for (const entry of current ?? []) {
    const key = entry.key.trim();
    if (key) {
      merged.set(key, { key, value: entry.value });
    }
  }
  for (const entry of incoming ?? []) {
    const key = entry.key.trim();
    if (!key) {
      continue;
    }
    const existing = merged.get(key);
    merged.set(key, {
      key,
      value: entry.value.trim().length > 0 ? entry.value : (existing?.value ?? ''),
    });
  }
  return Array.from(merged.values());
}
