import { describe, expect, it } from 'vitest';
import {
  LEGACY_EN_MATCHERS,
  LEGACY_ZH_CN_MATCHERS,
  type LegacyMatchers,
} from '../../fixtures/legacyAdapters';
import {
  LEGACY_ENUM_TABLE,
  LEGACY_ENUM_SYNONYM_GROUPS,
  DEGREE_OPTIONS,
  GENDER_OPTIONS,
  POLITICAL_STATUS_OPTIONS,
  JOB_TYPE_OPTIONS,
  FULL_TIME_OPTIONS,
} from '../../fixtures/legacyValueTables';
import { DEFAULT_DICTIONARY } from '../../../shared/dictionary/defaults';
import { compileDictionary, expandEnumGroups, toDeclarative } from '../../../shared/dictionary/compile';
import { matchSlotWithAdapters } from '../../../shared/apply/adapters';
import { expandEnumValue, normalizeEnum, type EnumKind } from '../../../shared/apply/value';
import type { FieldSlot } from '../../../shared/apply/slotTypes';
import type { FieldPattern } from '../../../shared/dictionary/types';

/**
 * 「字段字典数据化」的等价性证明。
 *
 * 阶段 2 的目标是**零行为变化**：把 `adapters.ts` / `value.ts` / `cnProfile.ts` 里
 * 硬编码的正则表与枚举表搬进 JSON。搬完之后必须证明「匹配结果一模一样」，
 * 否则就是在悄悄改产品行为。
 *
 * 做法是差分测试：把迁移前的实现（tests/fixtures/legacy*）当作 oracle，
 * 用同一批探针喂给新旧两套实现，逐条比对结论。
 */

// ---------------------------------------------------------------- legacy oracle

const LEGACY_TABLES: Record<string, LegacyMatchers> = {
  en_default: LEGACY_EN_MATCHERS,
  zh_cn: LEGACY_ZH_CN_MATCHERS,
};

/** 迁移前 matchSlotWithAdapters 的实现，逐行照搬（含「最长命中优先」）。 */
function legacyMatchSlot(text: string, adapterIds?: string[]): FieldSlot | null {
  const variants = legacyVariants(text);
  if (variants.length === 0) {
    return null;
  }
  const ids = !adapterIds || adapterIds.length === 0 ? Object.keys(LEGACY_TABLES) : adapterIds;
  let bestSlot: FieldSlot | null = null;
  let bestLength = 0;
  for (const id of ids) {
    const table = LEGACY_TABLES[id];
    if (!table) {
      continue;
    }
    for (const [slot, patterns] of Object.entries(table) as [FieldSlot, RegExp[]][]) {
      for (const variant of variants) {
        for (const pattern of patterns) {
          const match = pattern.exec(variant);
          if (!match) {
            continue;
          }
          if (match[0].length > bestLength) {
            bestLength = match[0].length;
            bestSlot = slot;
          }
        }
      }
    }
  }
  return bestSlot;
}

function legacyVariants(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) {
    return [];
  }
  const stripped = trimmed
    .replace(/[：:]/g, ' ')
    .replace(/[（）()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(new Set([trimmed, stripped, stripped.toLowerCase()]));
}

// ---------------------------------------------------------------- 探针语料

function needlesOf(patterns: Record<string, FieldPattern[]>): string[] {
  const out = new Set<string>();
  for (const list of Object.values(patterns)) {
    for (const pattern of list) {
      if (pattern.mode !== 'regex' && pattern.match.length > 0) {
        out.add(pattern.match);
      }
    }
  }
  return [...out];
}

/** 把探针加工成「页面上真实会出现的样子」，覆盖变体归一化的三条路径。 */
function decorate(needle: string): string[] {
  return [
    needle,
    ` ${needle} `,
    `${needle}：`,
    `：${needle}`,
    `${needle} *`,
    `（${needle}）`,
    `${needle}（必填）`,
    `${needle} job`,
    `请填写${needle}`,
    `please enter your ${needle}`,
    needle.toUpperCase(),
    needle.toLowerCase(),
  ];
}

/** 负例：任何真实实现都不该把它们认成这些 slot。 */
const NEGATIVE_PROBES = [
  '提交',
  '确定',
  '取消',
  '验证码',
  '上传附件',
  '本人承诺以上信息真实有效',
  'submit',
  'cancel',
  'captcha',
  'verification code',
  '',
  '   ',
];

const ALL_PROBES = (() => {
  const probes = new Set<string>(NEGATIVE_PROBES);
  for (const adapter of DEFAULT_DICTIONARY.adapters) {
    for (const needle of needlesOf(adapter.patterns)) {
      for (const variant of decorate(needle)) {
        probes.add(variant);
      }
    }
  }
  return [...probes];
})();

const ADAPTER_SETS: Array<[string, string[] | undefined]> = [
  ['全部适配器', undefined],
  ['仅中文', ['zh_cn']],
  ['仅英文', ['en_default']],
];

// ---------------------------------------------------------------- 测试

describe('字典等价性：匹配引擎', () => {
  it('探针语料足够大（否则这个测试没有说服力）', () => {
    expect(ALL_PROBES.length).toBeGreaterThan(1500);
  });

  for (const [label, ids] of ADAPTER_SETS) {
    it(`${label}：新旧实现对全部探针结论一致`, () => {
      const mismatches: Array<{ probe: string; legacy: FieldSlot | null; next: FieldSlot | null }> = [];
      for (const probe of ALL_PROBES) {
        const legacy = legacyMatchSlot(probe, ids);
        const next = matchSlotWithAdapters(probe, ids);
        if (legacy !== next) {
          mismatches.push({ probe, legacy, next });
        }
      }
      // 把差异全量打出来，别只报第一条 —— 差异往往是成片的
      expect(mismatches.slice(0, 20)).toEqual([]);
    });
  }

  it('regex 模式逐条沿用原正则的 source 与 flags', () => {
    const compiled = compileDictionary(DEFAULT_DICTIONARY);
    let regexCount = 0;
    for (const adapter of DEFAULT_DICTIONARY.adapters) {
      const table = LEGACY_TABLES[adapter.id];
      expect(table, `缺少 ${adapter.id} 的迁移基线`).toBeDefined();
      for (const [slot, patterns] of Object.entries(adapter.patterns)) {
        const legacyPatterns = (table as LegacyMatchers)[slot as FieldSlot] ?? [];
        expect(patterns.length, `${adapter.id}.${slot} 模式数量`).toBe(legacyPatterns.length);
        patterns.forEach((pattern, index) => {
          if (pattern.mode !== 'regex') {
            return;
          }
          regexCount += 1;
          const legacy = legacyPatterns[index];
          // flags 只允许去掉 g（有状态会串味），其余必须一致
          expect(pattern.match, `${adapter.id}.${slot}[${index}] source`).toBe(legacy.source);
          expect((pattern.flags ?? '').replace(/g/g, '')).toBe(legacy.flags.replace(/g/g, ''));
        });
      }
    }
    // 79 条保留为正则（英文表里 \s* / (a|b)? 这类表达），其余都化简成了声明式
    expect(regexCount).toBe(79);
  });

  it('声明式化简没有偷偷改变语义', () => {
    for (const adapter of DEFAULT_DICTIONARY.adapters) {
      const table = LEGACY_TABLES[adapter.id];
      for (const [slot, patterns] of Object.entries(adapter.patterns)) {
        const legacyPatterns = (table as LegacyMatchers)[slot as FieldSlot] ?? [];
        patterns.forEach((pattern, index) => {
          if (pattern.mode === 'regex') {
            return;
          }
          // 化简的函数本身必须能复现这条 pattern —— 防止手改字典时写出
          // 「mode 和 match 不匹配」的条目（例如把 /^x$/ 写成 substring）
          const legacy = legacyPatterns[index];
          expect(toDeclarative(legacy.source), `${adapter.id}.${slot}[${index}]`).toEqual({
            match: pattern.match,
            mode: pattern.mode,
          });
        });
      }
    }
  });

  it('英文表的化简没有丢掉大小写不敏感', () => {
    // 旧表里含字母的模式全部带 i；新格式的声明式模式一律大小写不敏感，
    // 因此「小写探针」与「大写探针」必须给出同一个结论。
    const ids = ['en_default'];
    for (const probe of ['Email', 'PHONE', 'LinkedIn', 'Github', 'Summary', 'Skills']) {
      expect(matchSlotWithAdapters(probe, ids), probe).toBe(
        matchSlotWithAdapters(probe.toLowerCase(), ids),
      );
    }
  });
});

describe('字典等价性：枚举与同义词', () => {
  it('enums 段展开后与旧 ENUM_TABLE 完全一致', () => {
    expect(expandEnumGroups(DEFAULT_DICTIONARY.enums)).toEqual(
      LEGACY_ENUM_TABLE as unknown as Record<string, Record<string, string>>,
    );
  });

  it('normalizeEnum 对旧表里每个同义词都给出相同结果', () => {
    for (const [kind, map] of Object.entries(
      LEGACY_ENUM_TABLE as unknown as Record<string, Record<string, string>>,
    )) {
      for (const [synonym, canonical] of Object.entries(map)) {
        expect(normalizeEnum(synonym, kind as EnumKind), `${kind}: ${synonym}`).toBe(canonical);
      }
    }
  });

  it('synonyms 段与旧 ENUM_SYNONYM_GROUPS 一致', () => {
    expect(DEFAULT_DICTIONARY.synonyms).toEqual(LEGACY_ENUM_SYNONYM_GROUPS);
  });

  it('expandEnumValue 对语料给出与旧表相同的候选', () => {
    const probes = new Set<string>(['男', '女', '硕士', '本科', '全职', '中共党员', '汉族', '神秘选项']);
    for (const group of LEGACY_ENUM_SYNONYM_GROUPS) {
      for (const token of group) {
        probes.add(token);
      }
    }
    for (const probe of probes) {
      // 旧实现：拿旧常量组重算一遍
      const norm = probe.trim().toLowerCase().replace(/\s+/g, ' ');
      const expected = new Set<string>([probe]);
      for (const group of LEGACY_ENUM_SYNONYM_GROUPS) {
        if (group.some((token) => token.trim().toLowerCase().replace(/\s+/g, ' ') === norm)) {
          for (const token of group) {
            expected.add(token);
          }
        }
      }
      expect(expandEnumValue(probe), probe).toEqual([...expected]);
    }
  });
});

describe('字典等价性：下拉选项', () => {
  it('options 段与旧常量一致', () => {
    expect(DEFAULT_DICTIONARY.options.degree).toEqual([...DEGREE_OPTIONS]);
    expect(DEFAULT_DICTIONARY.options.gender).toEqual([...GENDER_OPTIONS]);
    expect(DEFAULT_DICTIONARY.options.politicalStatus).toEqual([...POLITICAL_STATUS_OPTIONS]);
    expect(DEFAULT_DICTIONARY.options.jobType).toEqual([...JOB_TYPE_OPTIONS]);
    expect(DEFAULT_DICTIONARY.options.fullTime).toEqual([...FULL_TIME_OPTIONS]);
  });
});
