/**
 * 迁移基线（oracle）：字段字典数据化之前，散落在 value.ts 与 cnProfile.ts 里的
 * 枚举同义词表与下拉选项。**原样搬过来，一字未改。**
 *
 * 与 legacyAdapters.ts 同源同用途：只服务于等价性测试，证明
 * 「TS 常量 -> 字典 JSON」的转换零行为变化。稳定后可删。
 */
import type { EnumKind } from '../../shared/apply/value';

export const LEGACY_ENUM_TABLE: Record<EnumKind, Record<string, string>> = {
  gender: {
    male: 'male',
    m: 'male',
    man: 'male',
    男: 'male',
    female: 'female',
    f: 'female',
    woman: 'female',
    女: 'female',
    other: 'other',
    unspecified: 'other',
  },
  maritalStatus: {
    single: 'single',
    unmarried: 'single',
    未婚: 'single',
    married: 'married',
    已婚: 'married',
    divorced: 'divorced',
  },
  educationLevel: {
    doctoral: 'doctoral',
    phd: 'doctoral',
    doctor: 'doctoral',
    "master's": 'masters',
    master: 'masters',
    masters: 'masters',
    postgraduate: 'masters',
    "bachelor's": 'bachelors',
    bachelor: 'bachelors',
    university: 'bachelors',
    college: 'bachelors',
    associate: 'associate',
    diploma: 'associate',
    highschool: 'highschool',
    'high school': 'highschool',
  },
  experienceLevel: {
    intern: 'internship',
    internship: 'internship',
    entry: 'entry',
    junior: 'entry',
    mid: 'mid',
    senior: 'senior',
    lead: 'lead',
    manager: 'management',
    director: 'management',
  },
  jobType: {
    fulltime: 'full-time',
    'full time': 'full-time',
    全职: 'full-time',
    parttime: 'part-time',
    'part time': 'part-time',
    兼职: 'part-time',
    contract: 'contract',
    freelance: 'contract',
    temporary: 'contract',
    internship: 'internship',
  },
};

export const DEGREE_OPTIONS = ['大专', '本科', '硕士', '博士'] as const;
export const GENDER_OPTIONS = ['男', '女'] as const;
export const POLITICAL_STATUS_OPTIONS = [
  '中共党员',
  '中共预备党员',
  '共青团员',
  '群众',
  '民主党派',
] as const;
export const JOB_TYPE_OPTIONS = ['全职', '实习', '兼职'] as const;
export const FULL_TIME_OPTIONS = ['全日制', '非全日制'] as const;


export const LEGACY_ENUM_SYNONYM_GROUPS: string[][] = [
  ['男', 'male', 'm', 'man'],
  ['女', 'female', 'f', 'woman'],
  ['其他', 'other', 'unspecified', '不愿透露'],
  ['高中', 'highschool', 'high school', 'senior high school'],
  ['大专', '专科', 'associate', 'associate degree', 'college', 'diploma'],
  ['本科', '大学本科', 'bachelor', "bachelor's", 'bachelors', 'undergraduate'],
  ['硕士', '研究生', '硕士研究生', 'master', "master's", 'masters', 'postgraduate'],
  ['博士', '博士研究生', 'phd', 'ph.d.', 'doctor', 'doctoral', 'doctorate'],
  ['全职', 'full-time', 'fulltime', 'full time'],
  ['兼职', 'part-time', 'parttime', 'part time'],
  ['实习', 'internship', 'intern', 'trainee'],
  ['全日制', 'full-time study', 'full time study'],
  ['非全日制', 'part-time study', 'part time study'],
  ['中共党员', '党员', 'ccp member', 'cpc member', 'party member', 'communist party member'],
  ['中共预备党员', '预备党员', 'probationary party member'],
  ['共青团员', '团员', 'league member', 'youth league member'],
  ['群众', '普通群众', 'the masses', 'ordinary citizen'],
  ['民主党派', 'democratic party', 'non-ccp party member'],
  ['未婚', 'single', 'unmarried'],
  ['已婚', 'married'],
  ['离异', 'divorced'],
  ['汉族', 'han', 'han chinese'],
];
