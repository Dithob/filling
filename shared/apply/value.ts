export type EnumKind =
  | 'gender'
  | 'maritalStatus'
  | 'educationLevel'
  | 'experienceLevel'
  | 'jobType';

const ENUM_TABLE: Record<EnumKind, Record<string, string>> = {
  gender: {
    male: 'male',
    m: 'male',
    man: 'male',
    男: 'male',
    female: 'female',
    f: 'female',
    woman: 'female',
    女: 'female',
    other: 'other',
    unspecified: 'other',
  },
  maritalStatus: {
    single: 'single',
    unmarried: 'single',
    未婚: 'single',
    married: 'married',
    已婚: 'married',
    divorced: 'divorced',
  },
  educationLevel: {
    doctoral: 'doctoral',
    phd: 'doctoral',
    doctor: 'doctoral',
    "master's": 'masters',
    master: 'masters',
    masters: 'masters',
    postgraduate: 'masters',
    "bachelor's": 'bachelors',
    bachelor: 'bachelors',
    university: 'bachelors',
    college: 'bachelors',
    associate: 'associate',
    diploma: 'associate',
    highschool: 'highschool',
    'high school': 'highschool',
  },
  experienceLevel: {
    intern: 'internship',
    internship: 'internship',
    entry: 'entry',
    junior: 'entry',
    mid: 'mid',
    senior: 'senior',
    lead: 'lead',
    manager: 'management',
    director: 'management',
  },
  jobType: {
    fulltime: 'full-time',
    'full time': 'full-time',
    全职: 'full-time',
    parttime: 'part-time',
    'part time': 'part-time',
    兼职: 'part-time',
    contract: 'contract',
    freelance: 'contract',
    temporary: 'contract',
    internship: 'internship',
  },
};

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
  const table = ENUM_TABLE[kind];
  if (!table) {
    return undefined;
  }
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase().replace(/\s+/g, ' ');
    return table[key];
  }
  return undefined;
}

/**
 * 同义候选组：把 profile 里的一个值展开成「页面上可能出现的所有写法」。
 *
 * 上游的 `normalizeEnum` 只会把中文单向转成英文规范值，而国内表单的 select / radio
 * 选项恰恰是中文（学历：本科 / 硕士；政治面貌：中共党员），单向转换反而填不进去。
 * 填充器改成用这里展开出的候选集去匹配 option 文案，中英双向都能命中。
 */
const ENUM_SYNONYM_GROUPS: string[][] = [
  ['男', 'male', 'm', 'man'],
  ['女', 'female', 'f', 'woman'],
  ['其他', 'other', 'unspecified', '不愿透露'],
  ['高中', 'highschool', 'high school', 'senior high school'],
  ['大专', '专科', 'associate', 'associate degree', 'college', 'diploma'],
  ['本科', '大学本科', 'bachelor', "bachelor's", 'bachelors', 'undergraduate'],
  ['硕士', '研究生', '硕士研究生', 'master', "master's", 'masters', 'postgraduate'],
  ['博士', '博士研究生', 'phd', 'ph.d.', 'doctor', 'doctoral', 'doctorate'],
  ['全职', 'full-time', 'fulltime', 'full time'],
  ['兼职', 'part-time', 'parttime', 'part time'],
  ['实习', 'internship', 'intern', 'trainee'],
  ['全日制', 'full-time study', 'full time study'],
  ['非全日制', 'part-time study', 'part time study'],
  ['中共党员', '党员', 'ccp member', 'cpc member', 'party member', 'communist party member'],
  ['中共预备党员', '预备党员', 'probationary party member'],
  ['共青团员', '团员', 'league member', 'youth league member'],
  ['群众', '普通群众', 'the masses', 'ordinary citizen'],
  ['民主党派', 'democratic party', 'non-ccp party member'],
  ['未婚', 'single', 'unmarried'],
  ['已婚', 'married'],
  ['离异', 'divorced'],
  ['汉族', 'han', 'han chinese'],
];

function normalizeEnumToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * 把值展开成同义候选（含原值本身）。没有命中任何同义组时只返回原值。
 */
export function expandEnumValue(value: unknown): string[] {
  const text = coerceString(value);
  if (!text) {
    return [];
  }
  const key = normalizeEnumToken(text);
  const results = new Set<string>([text]);
  for (const group of ENUM_SYNONYM_GROUPS) {
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
