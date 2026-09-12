import { describe, expect, it } from 'vitest';
import { detectDateInputFormat, formatDateForInput } from '../../../shared/apply/dateInput';

describe('detectDateInputFormat', () => {
  it('按 placeholder 猜格式', () => {
    expect(detectDateInputFormat('YYYY-MM-DD')).toBe('YYYY-MM-DD');
    expect(detectDateInputFormat('YYYY-MM')).toBe('YYYY-MM');
    expect(detectDateInputFormat('YYYY/MM/DD')).toBe('YYYY/MM/DD');
    expect(detectDateInputFormat('YYYY年M月')).toBe('YYYY年M月');
    expect(detectDateInputFormat('YYYY年M月D日')).toBe('YYYY年M月D日');
  });

  it('猜不出来时按完整日期处理', () => {
    expect(detectDateInputFormat('')).toBe('YYYY-MM-DD');
    expect(detectDateInputFormat(undefined)).toBe('YYYY-MM-DD');
    expect(detectDateInputFormat('请选择日期')).toBe('YYYY-MM-DD');
  });
});

describe('formatDateForInput', () => {
  it('格式化归一化后的日期', () => {
    expect(formatDateForInput('2027-06-30', 'YYYY-MM-DD')).toBe('2027-06-30');
    expect(formatDateForInput('2027-06-30', 'YYYY/MM/DD')).toBe('2027/06/30');
    expect(formatDateForInput('2027-06-30', 'YYYY-MM')).toBe('2027-06');
    expect(formatDateForInput('2027-06-30', 'YYYY年M月')).toBe('2027年6月');
    expect(formatDateForInput('2027-06-30', 'YYYY年M月D日')).toBe('2027年6月30日');
  });

  it('接受中文日期输入', () => {
    expect(formatDateForInput('2027年6月', 'YYYY-MM-DD')).toBe('2027-06-01');
    expect(formatDateForInput('2027年6月30日', 'YYYY年M月D日')).toBe('2027年6月30日');
  });

  it('无法解析时返回 null，避免填错值', () => {
    expect(formatDateForInput('随时到岗', 'YYYY-MM-DD')).toBeNull();
    expect(formatDateForInput('', 'YYYY-MM-DD')).toBeNull();
    expect(formatDateForInput(undefined, 'YYYY-MM-DD')).toBeNull();
  });
});
