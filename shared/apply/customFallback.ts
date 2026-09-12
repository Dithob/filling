import { coerceString } from './value';

/**
 * 「页面问题 -> 答案」兜底：字段没能匹配到任何 FieldSlot 时（长尾开放题，如
 * 「是否服从调剂」「你为什么选择我们」），用页面标签直接去 profile.custom 查答案。
 */

/** 归一化问题文本：去掉空白与中英标点、转小写，让「是否服从调剂？」和「是否服从调剂」等价。 */
export function normalizeQuestionKey(value: string): string {
  return value
    .replace(/[\s\u3000]+/g, '')
    .replace(/[：:？?。.、,，;；!！"'“”‘’()（）[\]【】{}<>《》/\\|-]+/g, '')
    .toLowerCase();
}

interface CustomAnswerEntry {
  key: string;
  value: string;
}

function buildEntries(answers: Record<string, string> | undefined): CustomAnswerEntry[] {
  if (!answers) {
    return [];
  }
  const entries: CustomAnswerEntry[] = [];
  for (const [rawKey, rawValue] of Object.entries(answers)) {
    const key = normalizeQuestionKey(rawKey);
    const value = coerceString(rawValue);
    if (key && value) {
      entries.push({ key, value });
    }
  }
  return entries;
}

/**
 * 命中规则（从严到宽）：标签精确相等 -> context 中的任一段落精确相等 -> 标签包含问题文本。
 * 只做「页面文本包含自定义问题」，不做反向包含，避免短键（如「专业」）在长 context 里乱命中。
 */
export function matchCustomAnswer(
  label: string,
  context: string | undefined,
  answers: Record<string, string> | undefined,
): string | undefined {
  const entries = buildEntries(answers);
  if (entries.length === 0) {
    return undefined;
  }

  const tokens = [label, ...(context ?? '').split('|')]
    .map((token) => normalizeQuestionKey(token ?? ''))
    .filter((token) => token.length > 0);

  for (const token of tokens) {
    const exact = entries.find((entry) => entry.key === token);
    if (exact) {
      return exact.value;
    }
  }

  const candidates = tokens.filter((token) => token.length >= 2);
  for (const entry of entries) {
    if (entry.key.length < 2) {
      continue;
    }
    if (candidates.some((token) => token.includes(entry.key))) {
      return entry.value;
    }
  }
  return undefined;
}
