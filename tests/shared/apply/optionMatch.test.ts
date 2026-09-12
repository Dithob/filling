import { describe, expect, it } from 'vitest';
import { normalizeOptionText, pickOptionIndex } from '../../../shared/apply/optionMatch';

const DEGREE_OPTIONS = [
  { value: 'associate', label: '大专' },
  { value: 'bachelor', label: '本科' },
  { value: 'master', label: '硕士' },
  { value: 'phd', label: '博士' },
];

describe('normalizeOptionText', () => {
  it('去掉空白、全角括号与尾部冒号并转小写', () => {
    expect(normalizeOptionText(' 中共 党员（含预备） ')).toBe('中共党员(含预备)');
    expect(normalizeOptionText('Full Time:')).toBe('fulltime');
    expect(normalizeOptionText(null)).toBe('');
  });
});

describe('pickOptionIndex', () => {
  it('按文案精确命中', () => {
    expect(pickOptionIndex(DEGREE_OPTIONS, ['硕士'])).toBe(2);
  });

  it('按 value 命中', () => {
    expect(pickOptionIndex(DEGREE_OPTIONS, ['bachelor'])).toBe(1);
  });

  it('按同义候选命中（英文值 -> 中文文案）', () => {
    expect(pickOptionIndex(DEGREE_OPTIONS, ['master', "master's", '研究生'])).toBe(2);
    expect(pickOptionIndex(DEGREE_OPTIONS, ['undergraduate', 'bachelor'])).toBe(1);
  });

  it('选项文案比候选更长时用包含关系命中', () => {
    const options = [
      { value: 'cpc', label: '中共党员（含预备党员）' },
      { value: 'league', label: '共青团员' },
    ];
    expect(pickOptionIndex(options, ['中共党员'])).toBe(0);
  });

  it('完全相等优先于包含关系', () => {
    const options = [
      { value: 'a', label: '中共党员（含预备党员）' },
      { value: 'b', label: '中共党员' },
    ];
    expect(pickOptionIndex(options, ['中共党员'])).toBe(1);
  });

  it('多个候选时取重叠最多的选项', () => {
    const options = [
      { value: 'full', label: '全职' },
      { value: 'intern', label: '实习' },
    ];
    expect(pickOptionIndex(options, ['全职', '实习'])).toBe(0);
  });

  it('没有可接受的匹配时返回 -1', () => {
    expect(pickOptionIndex(DEGREE_OPTIONS, ['神秘学历'])).toBe(-1);
    expect(pickOptionIndex(DEGREE_OPTIONS, [''])).toBe(-1);
    expect(pickOptionIndex([], ['硕士'])).toBe(-1);
  });
});
