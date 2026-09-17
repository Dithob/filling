import { describe, expect, it } from 'vitest';
import { validateResume } from '../../shared/validate';

/**
 * `meta.custom` 是 cnProfileBridge 承载国内扩展字段（民族 / 政治面貌 / 身份证号…）
 * 的通道，所以 schema 必须放行它——否则每存一次带校园扩展字段的档案都会报一条
 * 「meta 上有不认识的键」的假校验警告。
 *
 * 同时 `additionalProperties: false` 不能被放开成 true，否则 schema 就失去了
 * 「挡住模型乱编字段」的作用。
 *
 * 关于下面的报错文案：校验器现在把 `additionalProperties` 单独格式化，会**点名**
 * 出问题的那个键（`/meta/notAThing is not allowed.`），而不是照抄 AJV 的
 * `must NOT have additional properties`。CN 档案校验（AI 解析的回喂修复）需要
 * 这个键名才能告诉模型该删哪个字段，两条路径因此共用同一套文案。
 */
describe('validateResume', () => {
  it('放行 meta.custom 的字符串键值', () => {
    const result = validateResume({
      basics: { name: '张伟' },
      meta: { custom: { idCard: '110101199903120011', nation: '汉族' } },
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('meta.custom 里的值必须是字符串', () => {
    const result = validateResume({ meta: { custom: { idCard: 110101 } } });

    expect(result.valid).toBe(false);
    expect(result.errors?.join('\n')).toContain('string');
  });

  it('仍然拒绝 meta 上的未知键', () => {
    const result = validateResume({ meta: { notAThing: 'x' } });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('/meta/notAThing is not allowed.');
  });

  it('仍然拒绝根对象上的未知键', () => {
    const result = validateResume({ notAThing: 'x' });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('/notAThing is not allowed.');
  });

  it('拒绝非对象入参', () => {
    expect(validateResume('nope').valid).toBe(false);
    expect(validateResume(null).valid).toBe(false);
  });
});
