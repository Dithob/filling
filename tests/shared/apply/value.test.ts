import { describe, expect, it } from 'vitest';
import {
  getValueByPath,
  normalizeDate,
  normalizeEnum,
  coerceString,
  expandEnumValue,
} from '../../../shared/apply/value';

describe('value helpers', () => {
  describe('getValueByPath', () => {
    const source = {
      basics: {
        name: 'Ada Lovelace',
        location: {
          city: 'London',
        },
      },
      work: [
        {
          company: 'Analytical Engines',
          startDate: '1835-01-01',
        },
      ],
    };

    it('reads dotted paths', () => {
      expect(getValueByPath(source, 'basics.name')).toBe('Ada Lovelace');
    });

    it('reads array bracket paths', () => {
      expect(getValueByPath(source, 'work[0].company')).toBe('Analytical Engines');
    });

    it('returns undefined for missing segments', () => {
      expect(getValueByPath(source, 'work[1].company')).toBeUndefined();
    });
  });

  describe('normalizeDate', () => {
    it('accepts ISO strings', () => {
      expect(normalizeDate('2020-02-03')).toBe('2020-02-03');
    });

    it('pads shorthand values', () => {
      expect(normalizeDate('2020/3/7')).toBe('2020-03-07');
    });

    it('uses year only when provided', () => {
      expect(normalizeDate('1999')).toBe('1999-01-01');
    });

    it('returns undefined for junk', () => {
      expect(normalizeDate('unknown date')).toBeUndefined();
    });
  });

  describe('normalizeEnum', () => {
    it('normalizes gender synonyms', () => {
      expect(normalizeEnum('Female', 'gender')).toBe('female');
      expect(normalizeEnum('男', 'gender')).toBe('male');
    });

    it('returns undefined when no match', () => {
      expect(normalizeEnum('mystery', 'gender')).toBeUndefined();
    });
  });

  describe('expandEnumValue', () => {
    it('把中文枚举展开成中英候选', () => {
      expect(expandEnumValue('男')).toEqual(expect.arrayContaining(['男', 'male']));
      expect(expandEnumValue('硕士')).toEqual(
        expect.arrayContaining(['硕士', '研究生', 'master', 'masters', 'postgraduate']),
      );
      expect(expandEnumValue('全职')).toEqual(expect.arrayContaining(['全职', 'full-time']));
    });

    it('英文写法也能展开回中文，保证双向匹配', () => {
      expect(expandEnumValue('Bachelor')).toEqual(expect.arrayContaining(['本科', 'bachelor']));
      expect(expandEnumValue('CPC member')).toEqual(expect.arrayContaining(['中共党员', '党员']));
    });

    it('未知值只返回原值', () => {
      expect(expandEnumValue('神秘选项')).toEqual(['神秘选项']);
    });

    it('空值返回空数组', () => {
      expect(expandEnumValue('')).toEqual([]);
      expect(expandEnumValue(undefined)).toEqual([]);
    });
  });

  describe('coerceString', () => {
    it('trims strings and ignores blanks', () => {
      expect(coerceString('  hello ')).toBe('hello');
      expect(coerceString('   ')).toBeUndefined();
    });

    it('coerces numbers', () => {
      expect(coerceString(42)).toBe('42');
    });
  });
});
