import { describe, expect, it } from 'vitest';
import {
  customEntriesToRecord,
  mergeCustomEntries,
  parseCustomEntries,
} from '../../../../entrypoints/options/hooks/profileFormMeta';

describe('parseCustomEntries', () => {
  it('把 Record 摊平成键值对并 trim', () => {
    expect(parseCustomEntries({ ' 政治面貌 ': ' 中共党员 ', 是否服从调剂: '是' })).toEqual([
      { key: '政治面貌', value: '中共党员' },
      { key: '是否服从调剂', value: '是' },
    ]);
  });

  it('丢弃空键与空值，忽略非对象输入', () => {
    expect(parseCustomEntries({ 空值: '   ', '': '有值', 有效: '值' })).toEqual([
      { key: '有效', value: '值' },
    ]);
    expect(parseCustomEntries(undefined)).toEqual([]);
    expect(parseCustomEntries('文本')).toEqual([]);
    expect(parseCustomEntries(['a'])).toEqual([]);
  });

  it('非字符串值不写入编辑器', () => {
    expect(parseCustomEntries({ 数字: 42, 有效: '值' })).toEqual([{ key: '有效', value: '值' }]);
  });
});

describe('customEntriesToRecord', () => {
  it('丢掉空键与空值', () => {
    expect(
      customEntriesToRecord([
        { key: '政治面貌', value: '中共党员' },
        { key: '  ', value: '有值' },
        { key: '空值', value: '  ' },
      ]),
    ).toEqual({ 政治面貌: '中共党员' });
  });

  it('空数组与 undefined 都得到空表（允许清空兜底答案）', () => {
    expect(customEntriesToRecord([])).toEqual({});
    expect(customEntriesToRecord(undefined)).toEqual({});
  });

  it('与 parseCustomEntries 往返一致', () => {
    const record = { 政治面貌: '中共党员', 是否服从调剂: '是' };
    expect(customEntriesToRecord(parseCustomEntries(record))).toEqual(record);
  });
});

describe('mergeCustomEntries', () => {
  it('按 key 取并集，incoming 的非空值覆盖 current', () => {
    const merged = mergeCustomEntries(
      [
        { key: '政治面貌', value: '共青团员' },
        { key: '是否服从调剂', value: '是' },
      ],
      [
        { key: '政治面貌', value: '中共党员' },
        { key: '期望城市', value: '杭州' },
      ],
    );

    expect(merged).toEqual([
      { key: '政治面貌', value: '中共党员' },
      { key: '是否服从调剂', value: '是' },
      { key: '期望城市', value: '杭州' },
    ]);
  });

  it('incoming 的空值不会覆盖已有答案', () => {
    const merged = mergeCustomEntries([{ key: '是否服从调剂', value: '是' }], [
      { key: '是否服从调剂', value: '' },
    ]);

    expect(merged).toEqual([{ key: '是否服从调剂', value: '是' }]);
  });

  it('忽略空 key', () => {
    expect(mergeCustomEntries([], [{ key: '  ', value: 'x' }])).toEqual([]);
  });
});
