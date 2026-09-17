import type { FieldSlot } from '../apply/slotTypes';
import type {
  CompiledAdapter,
  CompiledAdapterMatchers,
  CompiledPattern,
  DictionaryAdapter,
  EnumGroups,
  FieldDictionary,
  FieldPattern,
  MatcherMode,
} from './types';

const VALID_MODES: MatcherMode[] = ['substring', 'exact', 'prefix', 'suffix', 'regex'];

/** 正则元字符。含这些字符的模式不能被简化成声明式形态。 */
const REGEX_META_RE = /[\\.[\]()+*?{}|^$]/;

export interface CompileIssue {
  adapterId: string;
  slot?: string;
  pattern?: string;
  message: string;
}

export interface CompileResult {
  adapters: CompiledAdapter[];
  issues: CompileIssue[];
}

/**
 * 把一条声明式 pattern 编译成可执行的匹配器。
 *
 * 三条硬约束：
 * 1. **literal 模式一律小写化双方**，等价于旧的 `/x/i`。实测旧表里所有小写字母
 *    模式都自带 `i`、且没有「无 i 但含大写」的模式，所以这一步不改语义。
 * 2. **正则不带 `g`**：带 `g` 的 `exec` 有 `lastIndex` 状态，跨次调用会漏匹配。
 * 3. **坏正则只失效这一条**：编译失败返回 `null` 并记 issue，绝不抛出去让整份
 *    字典加载失败——用户手编的字典不该让扩展打不开。
 */
export function compilePattern(pattern: FieldPattern): CompiledPattern | null {
  const mode: MatcherMode = pattern.mode ?? 'substring';
  const raw = typeof pattern.match === 'string' ? pattern.match : '';
  if (raw.length === 0) {
    return null;
  }
  if (mode === 'regex') {
    const flags = (pattern.flags ?? '').replace(/g/g, '');
    try {
      return {
        needle: raw,
        mode,
        regex: new RegExp(raw, flags),
        note: pattern.note,
        source: pattern,
      };
    } catch {
      return null;
    }
  }
  return {
    needle: raw.toLowerCase(),
    mode,
    note: pattern.note,
    source: pattern,
  };
}

export function compileAdapter(adapter: DictionaryAdapter): { compiled: CompiledAdapter; issues: CompileIssue[] } {
  const issues: CompileIssue[] = [];
  const matchers: CompiledAdapterMatchers = {};

  for (const [slot, patterns] of Object.entries(adapter.patterns ?? {})) {
    if (!Array.isArray(patterns)) {
      issues.push({
        adapterId: adapter.id,
        slot,
        message: 'patterns 必须是数组',
      });
      continue;
    }
    const compiledList: CompiledPattern[] = [];
    for (const pattern of patterns) {
      if (!pattern || typeof pattern !== 'object') {
        issues.push({ adapterId: adapter.id, slot, message: 'pattern 必须是对象' });
        continue;
      }
      if (pattern.mode !== undefined && !VALID_MODES.includes(pattern.mode)) {
        issues.push({
          adapterId: adapter.id,
          slot,
          pattern: pattern.match,
          message: `未知的 mode: ${String(pattern.mode)}`,
        });
        continue;
      }
      const compiled = compilePattern(pattern);
      if (!compiled) {
        issues.push({
          adapterId: adapter.id,
          slot,
          pattern: pattern.match,
          message: '模式为空或正则无法编译，已跳过',
        });
        continue;
      }
      compiledList.push(compiled);
    }
    if (compiledList.length > 0) {
      matchers[slot as FieldSlot] = compiledList;
    }
  }

  return {
    compiled: {
      id: adapter.id,
      label: adapter.label,
      description: adapter.description,
      matchers,
    },
    issues,
  };
}

export function compileDictionary(dictionary: FieldDictionary): CompileResult {
  const issues: CompileIssue[] = [];
  const adapters: CompiledAdapter[] = [];
  for (const adapter of dictionary.adapters ?? []) {
    if (!adapter || typeof adapter.id !== 'string') {
      issues.push({ adapterId: '(unknown)', message: '适配器缺少 id' });
      continue;
    }
    if (adapter.enabled === false) {
      continue;
    }
    const result = compileAdapter(adapter);
    issues.push(...result.issues);
    adapters.push(result.compiled);
  }
  return { adapters, issues };
}

/** 把「规范值 → 同义词列表」展开成旧的扁平「同义词 → 规范值」。 */
export function expandEnumGroups(groups: EnumGroups | undefined): Record<string, Record<string, string>> {
  const table: Record<string, Record<string, string>> = {};
  for (const [kind, canonicalMap] of Object.entries(groups ?? {})) {
    const flat: Record<string, string> = {};
    for (const [canonical, synonyms] of Object.entries(canonicalMap ?? {})) {
      if (!Array.isArray(synonyms)) {
        continue;
      }
      for (const synonym of synonyms) {
        if (typeof synonym === 'string' && synonym.length > 0) {
          // 同义词表里若出现重复，先声明者胜（与旧扁平表的字面语义一致：后写覆盖
          // 会让人看不出到底哪个生效，这里选择保留第一条并保持确定性）。
          if (!(synonym in flat)) {
            flat[synonym] = canonical;
          }
        }
      }
    }
    table[kind] = flat;
  }
  return table;
}

/**
 * 校验一份外部字典（导入 / storage 里读出来的）。
 *
 * 刻意宽容：**逐条报错而不是整份拒绝**。用户从别处粘一份字典过来，个别条目写错
 * 不该让整个导入失败——能用的部分照用，坏的部分列出来让他改。
 */
export function parseDictionary(input: unknown): {
  dictionary: FieldDictionary | null;
  errors: string[];
} {
  const errors: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { dictionary: null, errors: ['字典必须是 JSON 对象'] };
  }
  const record = input as Record<string, unknown>;

  const rawAdapters = record.adapters;
  if (!Array.isArray(rawAdapters)) {
    errors.push('缺少 adapters 数组');
  }

  const adapters: DictionaryAdapter[] = [];
  if (Array.isArray(rawAdapters)) {
    rawAdapters.forEach((raw, index) => {
      if (!raw || typeof raw !== 'object') {
        errors.push(`adapters[${index}] 不是对象`);
        return;
      }
      const item = raw as Record<string, unknown>;
      if (typeof item.id !== 'string' || item.id.trim().length === 0) {
        errors.push(`adapters[${index}] 缺少 id`);
        return;
      }
      const rawPatterns = item.patterns;
      if (!rawPatterns || typeof rawPatterns !== 'object' || Array.isArray(rawPatterns)) {
        errors.push(`adapters[${index}].patterns 必须是对象`);
        return;
      }
      const patterns: Record<string, FieldPattern[]> = {};
      for (const [slot, list] of Object.entries(rawPatterns as Record<string, unknown>)) {
        if (!Array.isArray(list)) {
          errors.push(`adapters[${index}].patterns.${slot} 必须是数组`);
          continue;
        }
        const entries: FieldPattern[] = [];
        list.forEach((entry, patternIndex) => {
          // 允许简写：字符串等价于 { match, mode: 'substring' }
          if (typeof entry === 'string') {
            if (entry.length > 0) {
              entries.push({ match: entry });
            }
            return;
          }
          if (!entry || typeof entry !== 'object') {
            errors.push(`adapters[${index}].patterns.${slot}[${patternIndex}] 既不是字符串也不是对象`);
            return;
          }
          const pattern = entry as Record<string, unknown>;
          if (typeof pattern.match !== 'string' || pattern.match.length === 0) {
            errors.push(`adapters[${index}].patterns.${slot}[${patternIndex}] 缺少 match`);
            return;
          }
          entries.push({
            match: pattern.match,
            mode: pattern.mode as MatcherMode | undefined,
            flags: typeof pattern.flags === 'string' ? pattern.flags : undefined,
            note: typeof pattern.note === 'string' ? pattern.note : undefined,
          });
        });
        if (entries.length > 0) {
          patterns[slot] = entries;
        }
      }
      adapters.push({
        id: item.id,
        label: typeof item.label === 'string' ? item.label : undefined,
        description: typeof item.description === 'string' ? item.description : undefined,
        enabled: item.enabled !== false,
        patterns,
      });
    });
  }

  if (adapters.length === 0 && errors.length > 0) {
    return { dictionary: null, errors };
  }

  const enums: EnumGroups = {};
  if (record.enums && typeof record.enums === 'object' && !Array.isArray(record.enums)) {
    for (const [kind, canonicalMap] of Object.entries(record.enums as Record<string, unknown>)) {
      if (!canonicalMap || typeof canonicalMap !== 'object' || Array.isArray(canonicalMap)) {
        errors.push(`enums.${kind} 必须是对象`);
        continue;
      }
      const group: Record<string, string[]> = {};
      for (const [canonical, synonyms] of Object.entries(canonicalMap as Record<string, unknown>)) {
        if (!Array.isArray(synonyms)) {
          errors.push(`enums.${kind}.${canonical} 必须是数组`);
          continue;
        }
        group[canonical] = synonyms.filter((s): s is string => typeof s === 'string' && s.length > 0);
      }
      enums[kind] = group;
    }
  } else if (record.enums !== undefined) {
    errors.push('enums 必须是对象');
  }

  const options: Record<string, string[]> = {};
  if (record.options && typeof record.options === 'object' && !Array.isArray(record.options)) {
    for (const [key, list] of Object.entries(record.options as Record<string, unknown>)) {
      if (!Array.isArray(list)) {
        errors.push(`options.${key} 必须是数组`);
        continue;
      }
      options[key] = list.filter((s): s is string => typeof s === 'string' && s.length > 0);
    }
  } else if (record.options !== undefined) {
    errors.push('options 必须是对象');
  }

  const synonyms: string[][] = [];
  if (Array.isArray(record.synonyms)) {
    (record.synonyms as unknown[]).forEach((group, index) => {
      if (!Array.isArray(group)) {
        errors.push(`synonyms[${index}] 必须是数组`);
        return;
      }
      const tokens = group.filter((s): s is string => typeof s === 'string' && s.length > 0);
      if (tokens.length > 0) {
        synonyms.push(tokens);
      }
    });
  } else if (record.synonyms !== undefined) {
    errors.push('synonyms 必须是数组的数组');
  }

  return {
    dictionary: {
      version: typeof record.version === 'number' ? record.version : 1,
      adapters,
      enums,
      synonyms,
      options,
    },
    errors,
  };
}

/** 把正则源码化简成声明式形态；化不动就返回 null（交给 regex 模式）。 */
export function toDeclarative(raw: string): { match: string; mode: MatcherMode } | null {
  const isExact = raw.startsWith('^') && raw.endsWith('$') && raw.length > 2;
  const isPrefix = raw.startsWith('^') && !raw.endsWith('$');
  const isSuffix = !raw.startsWith('^') && raw.endsWith('$');
  const core = raw.replace(/^\^/, '').replace(/\$$/, '');
  if (core.length === 0 || REGEX_META_RE.test(core)) {
    return null;
  }
  if (isExact) {
    return { match: core, mode: 'exact' };
  }
  if (isPrefix) {
    return { match: core, mode: 'prefix' };
  }
  if (isSuffix) {
    return { match: core, mode: 'suffix' };
  }
  return { match: core, mode: 'substring' };
}
