/**
 * select / radio / 自定义下拉共用的选项匹配。
 *
 * 页面选项文案与 profile 里的值经常对不上（「中共党员」vs「中共党员（含预备）」、
 * 「本科」vs「大学本科」、value="han" 而文案是「汉族」），所以既要比 value 也要比文案，
 * 并且用 expandEnumValue 展开的同义候选一起参与匹配。
 */

export interface OptionLike {
  value: string;
  label: string;
}

/** 归一化选项文本：去掉所有空白、转小写、全角括号转半角，便于比较。 */
export function normalizeOptionText(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/[\s\u3000]+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[：:]+$/g, '')
    .toLowerCase();
}

/**
 * 选出最匹配的选项下标；没有可接受的匹配时返回 -1。
 *
 * 打分：完全相等 > 包含关系，包含关系里重叠字符越多越优先。
 * 「可接受」的下限是包含关系，纯靠同义候选里的一两个字撞上不算命中。
 */
export function pickOptionIndex(options: OptionLike[], candidates: string[]): number {
  if (!Array.isArray(options) || options.length === 0) {
    return -1;
  }
  const normalizedCandidates = Array.from(
    new Set(candidates.map((candidate) => normalizeOptionText(candidate)).filter(Boolean)),
  );
  if (normalizedCandidates.length === 0) {
    return -1;
  }

  let bestIndex = -1;
  let bestScore = 0;

  options.forEach((option, index) => {
    const texts = [normalizeOptionText(option.label), normalizeOptionText(option.value)].filter(Boolean);
    for (const text of texts) {
      for (const candidate of normalizedCandidates) {
        let score = 0;
        if (text === candidate) {
          score = 1000 + text.length;
        } else if (text.includes(candidate)) {
          score = candidate.length;
        } else if (candidate.includes(text)) {
          score = text.length;
        }
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }
    }
  });

  return bestIndex;
}
