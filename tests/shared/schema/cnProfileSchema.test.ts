import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeCnProfileData } from '../../../shared/schema/cnProfile';
import { validateCnProfile } from '../../../shared/validate';

/**
 * `cnProfile-v1.json` 是 AI 简历解析的落库闸门。它一旦和 TypeScript 里的
 * `CnProfileData` 漂移，就会出现「模型吐的字段被 JSON Schema 悄悄丢掉」或
 * 「代码要的字段 schema 没声明」两种事故，而且都不报错——所以这里用双向探针
 * 钉住：`normalizeCnProfileData({})` 会**显式列出六组的全部键**（缺的填
 * `undefined`），正好可以当运行时字段清单用。
 */
const schema = JSON.parse(
  readFileSync(join(process.cwd(), 'shared/schema/cnProfile-v1.json'), 'utf8'),
) as {
  additionalProperties: boolean;
  properties: Record<string, { additionalProperties?: unknown; properties?: Record<string, unknown> }>;
};

const GROUPS = ['basic', 'education', 'intention', 'links', 'texts', 'attachments'] as const;

describe('cnProfile-v1 与 CnProfileData 的形状一致性', () => {
  const probe = normalizeCnProfileData({}) as unknown as Record<string, Record<string, unknown>>;

  it.each(GROUPS)('%s 组的字段集合两边一字不差', (group) => {
    const codeKeys = Object.keys(probe[group]).sort();
    const schemaKeys = Object.keys(schema.properties[group].properties ?? {}).sort();

    expect(schemaKeys.length).toBeGreaterThan(0);
    expect(schemaKeys).toEqual(codeKeys);
  });

  it('根对象与每个分组都关掉了 additionalProperties', () => {
    expect(schema.additionalProperties).toBe(false);
    for (const group of GROUPS) {
      expect(schema.properties[group].additionalProperties, group).toBe(false);
    }
  });

  it('custom 是自由字典，但值必须是字符串', () => {
    expect(schema.properties.custom).toBeDefined();
    expect(validateCnProfile({ custom: { 是否服从调剂: '是' } }).valid).toBe(true);
    expect(validateCnProfile({ custom: { 是否服从调剂: 1 } }).valid).toBe(false);
  });
});

describe('validateCnProfile', () => {
  const minimal = { basic: { name: '张三' }, education: {}, intention: {}, custom: {} };

  it('接受只填了少数字段的解析结果', () => {
    expect(validateCnProfile(minimal)).toEqual({ valid: true, errors: [] });
  });

  it('空对象也算合法——简历可能什么都抽不到', () => {
    expect(validateCnProfile({}).valid).toBe(true);
  });

  it('拒绝根对象上的未知分组', () => {
    const result = validateCnProfile({ ...minimal, work: [] });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('/work is not allowed.');
  });

  it('拒绝分组里的未知字段，并点名那个字段', () => {
    const result = validateCnProfile({ ...minimal, basic: { name: '张三', nickName: '小三' } });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('/basic/nickName is not allowed.');
  });

  it('拒绝非字符串的字段值', () => {
    expect(validateCnProfile({ ...minimal, basic: { name: 123 } }).valid).toBe(false);
  });

  it('拒绝 JSON Resume 的 meta 包裹——目标形状是扁平档案', () => {
    expect(validateCnProfile({ meta: { custom: { 民族: '汉族' } } }).valid).toBe(false);
  });

  it('不做枚举约束：越界取值仍然通过，枚举由提示词与字典负责', () => {
    // 这是刻意的设计——枚举的唯一来源是 shared/dictionary/defaults.json 的
    // options 段。若在 schema 里再写死一份，改字典时就会静默漂移；而且一旦
    // 模型吐了字典里没有但在页面下拉项里存在的写法，schema 会把它当错误丢掉，
    // 反而损失数据。这里把这个决定固化成断言，避免以后有人「顺手补上 enum」。
    const result = validateCnProfile({ ...minimal, basic: { gender: '未填写' } });

    expect(result.valid).toBe(true);
  });
});
