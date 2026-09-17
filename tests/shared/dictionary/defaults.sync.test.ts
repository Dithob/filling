import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { LEGACY_EN_MATCHERS, LEGACY_ZH_CN_MATCHERS } from '../../fixtures/legacyAdapters';
import {
  LEGACY_ENUM_TABLE,
  LEGACY_ENUM_SYNONYM_GROUPS,
  DEGREE_OPTIONS,
  GENDER_OPTIONS,
  POLITICAL_STATUS_OPTIONS,
  JOB_TYPE_OPTIONS,
  FULL_TIME_OPTIONS,
} from '../../fixtures/legacyValueTables';
import { toDeclarative } from '../../../shared/dictionary/compile';
import type { FieldDictionary, FieldPattern } from '../../../shared/dictionary/types';

/**
 * `shared/dictionary/defaults.json` 的**生成器 + 同步守卫**。
 *
 * 这个文件取代了早期那个「每跑一次测试就写一次源码」的一次性生成器。现在：
 * - 默认（`vitest run`）：只校验磁盘上的 defaults.json 与旧表**逐条一致**，
 *   任何人不小心手改 JSON 都会在这里被打回。
 * - 重新生成：`WRITE_DICTIONARY=1 node node_modules/vitest/vitest.mjs run tests/shared/dictionary/defaults.sync.test.ts`
 *
 * 转换规则刻意保持机械、不做人工判断，避免把主观偏差混进字典：
 * - 模式不含正则元字符 -> 由 `toDeclarative` 化简成 substring/exact/prefix/suffix
 * - 含元字符 -> 原样保留为 regex，并带上原 flags
 *
 * 旧表（`tests/fixtures/legacy*`）是**冻结的对照物**：字典一旦稳定下来不再需要
 * 逐条比对，这组 fixture 与等价性测试可以一起删；在那之前它们是不可替代的 oracle。
 */
const DEFAULTS_PATH = 'shared/dictionary/defaults.json';

function convertMatchers(table: Record<string, RegExp[]>): Record<string, FieldPattern[]> {
  const out: Record<string, FieldPattern[]> = {};
  for (const [slot, patterns] of Object.entries(table)) {
    out[slot] = patterns.map((re) => {
      const declarative = toDeclarative(re.source);
      if (declarative) {
        return { match: declarative.match, mode: declarative.mode };
      }
      return { match: re.source, mode: 'regex' as const, flags: re.flags || undefined };
    });
  }
  return out;
}

/** 旧的扁平「同义词 -> 规范值」反查成「规范值 -> 同义词组」，好读也好改。 */
function groupEnums(
  flat: Record<string, Record<string, string>>,
): Record<string, Record<string, string[]>> {
  const grouped: Record<string, Record<string, string[]>> = {};
  for (const [kind, map] of Object.entries(flat)) {
    const group: Record<string, string[]> = {};
    for (const [synonym, canonical] of Object.entries(map)) {
      (group[canonical] ??= []).push(synonym);
    }
    grouped[kind] = group;
  }
  return grouped;
}

function buildExpected(): FieldDictionary {
  return {
    version: 1,
    adapters: [
      {
        id: 'en_default',
        enabled: true,
        patterns: convertMatchers(LEGACY_EN_MATCHERS as unknown as Record<string, RegExp[]>),
      },
      {
        id: 'zh_cn',
        enabled: true,
        patterns: convertMatchers(LEGACY_ZH_CN_MATCHERS as unknown as Record<string, RegExp[]>),
      },
    ],
    enums: groupEnums(LEGACY_ENUM_TABLE as unknown as Record<string, Record<string, string>>),
    synonyms: LEGACY_ENUM_SYNONYM_GROUPS.map((group) => [...group]),
    options: {
      degree: [...DEGREE_OPTIONS],
      gender: [...GENDER_OPTIONS],
      politicalStatus: [...POLITICAL_STATUS_OPTIONS],
      jobType: [...JOB_TYPE_OPTIONS],
      fullTime: [...FULL_TIME_OPTIONS],
    },
  };
}

function countPatterns(dictionary: FieldDictionary): {
  perAdapter: Record<string, number>;
  declarative: number;
  regex: number;
} {
  const perAdapter: Record<string, number> = {};
  let declarative = 0;
  let regex = 0;
  for (const adapter of dictionary.adapters) {
    let total = 0;
    for (const list of Object.values(adapter.patterns)) {
      for (const pattern of list) {
        total += 1;
        if (pattern.mode === 'regex') {
          regex += 1;
        } else {
          declarative += 1;
        }
      }
    }
    perAdapter[adapter.id] = total;
  }
  return { perAdapter, declarative, regex };
}

describe('defaults.json 与旧表同步', () => {
  const expected = buildExpected();

  if (process.env.WRITE_DICTIONARY === '1') {
    it('重新生成 defaults.json', () => {
      fs.writeFileSync(DEFAULTS_PATH, `${JSON.stringify(expected, null, 2)}\n`);
      console.log('生成完毕:', JSON.stringify(countPatterns(expected)));
      expect(fs.existsSync(DEFAULTS_PATH)).toBe(true);
    });
    return;
  }

  const onDisk = JSON.parse(fs.readFileSync(DEFAULTS_PATH, 'utf8')) as FieldDictionary;

  it('每个适配器的槽位与模式逐条一致', () => {
    expect(onDisk.adapters.map((a) => a.id)).toEqual(expected.adapters.map((a) => a.id));
    for (const expectedAdapter of expected.adapters) {
      const actual = onDisk.adapters.find((a) => a.id === expectedAdapter.id);
      expect(actual, `缺少适配器 ${expectedAdapter.id}`).toBeTruthy();
      expect(actual?.enabled).toBe(true);
      expect(actual?.patterns).toEqual(expectedAdapter.patterns);
    }
  });

  it('枚举表 / 同义词组 / 选项一一对应', () => {
    expect(onDisk.enums).toEqual(expected.enums);
    expect(onDisk.synonyms).toEqual(expected.synonyms);
    expect(onDisk.options).toEqual(expected.options);
  });

  it('正则数量与「能用声明式就不用正则」的结论一致', () => {
    const stats = countPatterns(onDisk);
    // 这两个数字是设计文档里记录的事实：绝大多数模式是纯子串，只有 79 条
    // 真的需要正则元字符。数量变动说明有人在 JSON 里手改，需要人工复核。
    expect(stats.regex).toBe(79);
    expect(stats.declarative).toBe(226);
    expect(Object.values(stats.perAdapter).reduce((a, b) => a + b, 0)).toBe(305);
  });
});
