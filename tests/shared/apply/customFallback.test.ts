import { describe, expect, it } from 'vitest';
import { matchCustomAnswer, normalizeQuestionKey } from '../../../shared/apply/customFallback';

const ANSWERS = {
  是否服从调剂: '是',
  '你为什么选择我们？': '贵司在推荐系统方向的积累与我的研究方向一致',
  期望城市: '杭州',
  是: '不应被单字命中',
};

describe('normalizeQuestionKey', () => {
  it('去掉空白、全角冒号与标点并转小写', () => {
    expect(normalizeQuestionKey(' 是否 服从调剂？ ')).toBe('是否服从调剂');
    expect(normalizeQuestionKey('Why Us?')).toBe('whyus');
    expect(normalizeQuestionKey('期望城市：')).toBe('期望城市');
  });
});

describe('matchCustomAnswer', () => {
  it('标签归一化后精确命中', () => {
    expect(matchCustomAnswer('是否服从调剂？', undefined, ANSWERS)).toBe('是');
    expect(matchCustomAnswer(' 是否 服从调剂 ', undefined, ANSWERS)).toBe('是');
  });

  it('标签包含自定义问题时命中', () => {
    expect(matchCustomAnswer('是否服从调剂（如不服从请说明）', undefined, ANSWERS)).toBe('是');
  });

  it('精确命中 context 中的段落', () => {
    expect(matchCustomAnswer('其他信息', '其他信息|期望城市|请输入', ANSWERS)).toBe('杭州');
  });

  it('没有答案表或没有命中时返回 undefined', () => {
    expect(matchCustomAnswer('是否服从调剂', undefined, undefined)).toBeUndefined();
    expect(matchCustomAnswer('你的星座', undefined, ANSWERS)).toBeUndefined();
    expect(matchCustomAnswer('', '|', ANSWERS)).toBeUndefined();
  });

  it('单字键不参与包含匹配', () => {
    // 「是」这个键只能在完全相等时命中，不能在长 context 里乱命中
    expect(matchCustomAnswer('是否可以接受出差', undefined, ANSWERS)).toBeUndefined();
    expect(matchCustomAnswer('是', undefined, ANSWERS)).toBe('不应被单字命中');
  });

  it('忽略空键与空值', () => {
    expect(matchCustomAnswer('空键', undefined, { '': '值', 空值: '   ' })).toBeUndefined();
  });
});
