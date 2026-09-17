import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSlotFromLabel, getAllAdapterIds } from '../../shared/apply/slots';
import { matchCustomAnswer } from '../../shared/apply/customFallback';
import { getDictionary } from '../../shared/dictionary/store';

const HTML_PATH = join(process.cwd(), 'docs/testbed/forms/ats-cn.html');
const FIXTURE_PATH = join(process.cwd(), 'docs/testbed/fixtures/sample-cn-profile.json');

const html = readFileSync(HTML_PATH, 'utf8');
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as { custom: Record<string, string> };
const ADAPTERS = getAllAdapterIds();

/** 页面上所有可见标签：`<label>文本<input>` 与 Element 风格的 `.el-form-item__label`。 */
function extractLabels(source: string): string[] {
  const labels = new Set<string>();
  for (const match of source.matchAll(/<label>\s*([^<]+?)\s*</g)) {
    labels.add(match[1].trim());
  }
  for (const match of source.matchAll(/el-form-item__label">([^<]+)</g)) {
    labels.add(match[1].trim());
  }
  return Array.from(labels);
}

/** 页面上声明的 data-slot 值（用于抓拼写错误）。 */
function extractDeclaredSlots(source: string): string[] {
  return Array.from(source.matchAll(/data-slot="([^"]+)"/g)).map((match) => match[1]);
}

const LABELS = extractLabels(html);

/**
 * 词典匹配表里真正声明过的全部 FieldSlot。
 *
 * 这份清单原先来自 `fieldClassificationResponse.ts` 的 `CLASSIFICATION_KNOWN_SLOTS`
 * ——那是「AI 分类字段」那条链路的产物，已随填表侧 AI 一起下线。改成直接从字段
 * 字典的匹配表取键：字典是字段知识的唯一来源，用它当基准就不会出现「两份清单
 * 各自漂移、谁也没发现」的老问题。
 */
const KNOWN_SLOTS = new Set(
  getDictionary().adapters.flatMap((adapter) => Object.keys(adapter.matchers)),
);

/** 这些字段本来就不该命中 slot：附件留给阶段 4，其余走 custom 兜底。 */
const NO_SLOT_LABELS = new Set(['简历附件', '是否服从调剂', '你为什么选择我们']);

describe('ats-cn 测试台', () => {
  it('页面上每个标签都能被词典识别（自定义答案字段除外）', () => {
    const unmatched = LABELS.filter(
      (label) => !NO_SLOT_LABELS.has(label) && resolveSlotFromLabel(label, ADAPTERS) === null,
    );
    expect(unmatched, `未识别标签: ${unmatched.join(' / ')}`).toEqual([]);
  });

  it('保留为自定义答案的字段确实不命中 slot', () => {
    for (const label of NO_SLOT_LABELS) {
      if (label === '简历附件') {
        continue;
      }
      expect(resolveSlotFromLabel(label, ADAPTERS), label).toBeNull();
    }
  });

  it('自定义答案字段能通过 custom 兜底拿到夹具里的值', () => {
    expect(matchCustomAnswer('是否服从调剂', '是否服从调剂|是|否', fixture.custom)).toBe(
      fixture.custom['是否服从调剂'],
    );
    expect(matchCustomAnswer('你为什么选择我们', '你为什么选择我们', fixture.custom)).toBe(
      fixture.custom['你为什么选择我们'],
    );
  });

  it('页面上声明的 data-slot 都是词典里真实存在的 FieldSlot', () => {
    const declared = extractDeclaredSlots(html);
    expect(declared.length).toBeGreaterThan(30);
    const invalid = declared.filter((slot) => slot !== 'custom' && !KNOWN_SLOTS.has(slot));
    expect(invalid, `未知 slot: ${invalid.join(' / ')}`).toEqual([]);
  });

  it('夹具覆盖了全部新增的校招 slot 取值', () => {
    const paths = Array.from(html.matchAll(/data-path="([^"]+)"/g)).map((match) => match[1]);
    const missing = paths.filter((path) => {
      const value = path.split('.').reduce<unknown>((current, key) => {
        if (current && typeof current === 'object') {
          return (current as Record<string, unknown>)[key];
        }
        return undefined;
      }, fixture);
      return value === undefined;
    });
    expect(missing, `夹具缺少这些路径: ${missing.join(' / ')}`).toEqual([]);
  });
});
