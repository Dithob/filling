import { getDictionary } from '../dictionary/store';

export type EnumKind =
  | 'gender'
  | 'maritalStatus'
  | 'educationLevel'
  | 'experienceLevel'
  | 'jobType';

export function getValueByPath<T = unknown>(source: unknown, path: string): T | undefined {
  if (!source || typeof path !== 'string' || !path.trim()) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(source as Record<string, unknown>, path)) {
    return (source as Record<string, unknown>)[path] as T;
  }
  const normalized = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current: any = source;
  for (const key of normalized) {
    if (current == null) {
      return undefined;
    }
    current = current[key];
  }
  return current as T | undefined;
}

export function normalizeDate(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDate(value);
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  // 中文日期：2027年6月30日 / 2027年6月
  const cnFull = trimmed.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/);
  if (cnFull) {
    return `${cnFull[1]}-${pad(cnFull[2])}-${pad(cnFull[3])}`;
  }
  const cnMonth = trimmed.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月?$/);
  if (cnMonth) {
    return `${cnMonth[1]}-${pad(cnMonth[2])}-01`;
  }

  const sanitized = trimmed.replace(/[./]/g, '-').replace(/\s+/g, '-').toLowerCase();
  if (/^\d{4}$/.test(sanitized)) {
    return `${sanitized}-01-01`;
  }
  const yearMonthMatch = sanitized.match(/^(\d{4})-(\d{1,2})$/);
  if (yearMonthMatch) {
    return `${yearMonthMatch[1]}-${pad(yearMonthMatch[2])}-01`;
  }
  const fullMatch = sanitized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (fullMatch) {
    return `${fullMatch[1]}-${pad(fullMatch[2])}-${pad(fullMatch[3])}`;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return toIsoDate(parsed);
  }
  return undefined;
}

export function normalizeEnum(value: unknown, kind: EnumKind): string | undefined {
  if (!value) {
    return undefined;
  }
  // 同义词表已搬进字段字典（shared/dictionary/defaults.json 的 enums 段），
  // 这里读运行时缓存：改字典即时生效，读不到就回落到内置字典。
  const table = getDictionary().enums[kind];
  if (!table) {
    return undefined;
  }
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase().replace(/\s+/g, ' ');
    return table[key];
  }
  return undefined;
}

function normalizeEnumToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * 把值展开成同义候选（含原值本身）。没有命中任何同义组时只返回原值。
 *
 * 同义候选组已搬进字段字典（`synonyms` 段）——国内表单的 select / radio 选项
 * 恰恰是中文（学历：本科 / 硕士），上游的单向 `normalizeEnum` 反而填不进去，
 * 所以填充器改用候选集去匹配 option 文案，中英双向都能命中。
 */
export function expandEnumValue(value: unknown): string[] {
  const text = coerceString(value);
  if (!text) {
    return [];
  }
  const key = normalizeEnumToken(text);
  const results = new Set<string>([text]);
  for (const group of getDictionary().synonyms) {
    if (group.some((token) => normalizeEnumToken(token) === key)) {
      for (const token of group) {
        results.add(token);
      }
    }
  }
  return Array.from(results);
}

export function coerceString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

export function toPrimaryArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === 'object') {
    return [value];
  }
  return [];
}

export function extractFirst<T>(value: unknown): T | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? (value[0] as T) : undefined;
  }
  return value as T;
}

function pad(value: string | undefined): string {
  if (!value) {
    return '01';
  }
  const normalized = value.replace(/\D/g, '');
  if (!normalized) {
    return '01';
  }
  return normalized.length === 1 ? `0${normalized}` : normalized.slice(0, 2);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
