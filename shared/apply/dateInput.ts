/**
 * 日期控件填充：profile 里的日期统一归一化成 `YYYY-MM-DD`，但页面上的日期输入框
 * 期望的格式五花八门（原生 date、`YYYY-MM`、`YYYY/MM/DD`、`2027年6月`）。
 * 这里按 placeholder / 已有值猜出目标格式，再格式化。
 */
import { normalizeDate } from './value';

export type DateInputFormat =
  | 'YYYY-MM-DD'
  | 'YYYY/MM/DD'
  | 'YYYY-MM'
  | 'YYYY/MM'
  | 'YYYY年M月'
  | 'YYYY年M月D日';

const PLACEHOLDER_PATTERNS: Array<[RegExp, DateInputFormat]> = [
  [/YYYY\s*年\s*M\s*月\s*D\s*日/i, 'YYYY年M月D日'],
  [/YYYY\s*年\s*M\s*月/i, 'YYYY年M月'],
  [/YYYY\s*\/\s*MM\s*\/\s*DD/i, 'YYYY/MM/DD'],
  [/YYYY\s*\/\s*MM/i, 'YYYY/MM'],
  [/YYYY\s*-\s*MM\s*-\s*DD/i, 'YYYY-MM-DD'],
  [/YYYY\s*-\s*MM/i, 'YYYY-MM'],
];

/** 依据 placeholder 猜格式，猜不出来时按完整日期处理。 */
export function detectDateInputFormat(placeholder: string | null | undefined): DateInputFormat {
  if (typeof placeholder !== 'string' || !placeholder.trim()) {
    return 'YYYY-MM-DD';
  }
  for (const [pattern, format] of PLACEHOLDER_PATTERNS) {
    if (pattern.test(placeholder)) {
      return format;
    }
  }
  return 'YYYY-MM-DD';
}

/** 把任意可归一化的日期渲染成目标格式；无法解析时返回 null（调用方应报失败而不是填错值）。 */
export function formatDateForInput(value: unknown, format: DateInputFormat): string | null {
  const iso = normalizeDate(value);
  if (!iso) {
    return null;
  }
  const [year, month, day] = iso.split('-');
  switch (format) {
    case 'YYYY/MM/DD':
      return `${year}/${month}/${day}`;
    case 'YYYY-MM':
      return `${year}-${month}`;
    case 'YYYY/MM':
      return `${year}/${month}`;
    case 'YYYY年M月':
      return `${year}年${Number(month)}月`;
    case 'YYYY年M月D日':
      return `${year}年${Number(month)}月${Number(day)}日`;
    case 'YYYY-MM-DD':
    default:
      return iso;
  }
}
