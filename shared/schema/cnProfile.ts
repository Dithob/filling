/**
 * Flat, China-campus-recruitment-oriented profile schema.
 *
 * This replaces JSON Resume as the source of truth. It is deliberately flat:
 * every value the user maintains is one key away, grouped by the sections that
 * actually appear on Chinese application forms (基本信息 / 教育经历 / 求职意向 …).
 *
 * The rest of the extension never reads this shape directly — `shared/apply/profile.ts`
 * resolves it into `SlotValueMap` (FieldSlot -> string), which is the contract
 * the matcher and fillers depend on.
 */

export interface CnBasic {
  name: string;
  gender?: string;
  birthDate?: string;
  /** 民族 */
  nation?: string;
  /** 政治面貌 */
  politicalStatus?: string;
  idCard?: string;
  phone: string;
  email: string;
  wechat?: string;
  qq?: string;
  city?: string;
  address?: string;
  /** 籍贯 */
  hometown?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  /** 英语水平，如 CET-6 / 雅思 7.0 */
  englishLevel?: string;
}

export interface CnEducation {
  school: string;
  /** 学历：大专 / 本科 / 硕士 / 博士 */
  degree: string;
  /** 专业 */
  major: string;
  enrollmentDate?: string;
  graduationDate?: string;
  gpa?: string;
  /** 专业排名，如 5/120 */
  ranking?: string;
  /** 培养方式：全日制 / 非全日制 */
  fullTime?: string;
}

export interface CnIntention {
  /** 应聘岗位 */
  position?: string;
  /** 期望城市 */
  expectedCity?: string;
  expectedSalary?: string;
  /** 到岗时间 */
  availability?: string;
  /** 可实习时长，如 6个月 */
  internshipDuration?: string;
  /** 工作性质：全职 / 实习 / 兼职 */
  jobType?: string;
}

export interface CnLinks {
  github?: string;
  blog?: string;
  portfolio?: string;
  linkedin?: string;
}

export interface CnTexts {
  /** 自我介绍 / 个人评价 */
  selfIntro?: string;
  /** 项目经历，多段用空行分隔 */
  projectExp?: string;
  /** 实习经历，多段用空行分隔 */
  internshipExp?: string;
  /** 校园经历 / 学生工作，多段用空行分隔 */
  campusExp?: string;
  awards?: string;
  skills?: string;
  researchDirection?: string;
  /** 兴趣爱好 / 特长 */
  hobbies?: string;
}

export interface CnAttachments {
  /** 简历库条目 id，见 shared/storage/resumeFiles.ts */
  resumeId?: string;
}

export interface CnProfileData {
  basic: CnBasic;
  education: CnEducation;
  intention: CnIntention;
  links: CnLinks;
  texts: CnTexts;
  attachments: CnAttachments;
  /** 兜底：「页面上的问题 -> 答案」，用于长尾开放式问题 */
  custom: Record<string, string>;
}

export interface CnProfile extends CnProfileData {
  id: string;
  /** 方案名，如「算法岗」「后端岗」 */
  name: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt?: string;
  /** 若由简历 PDF 解析而来，保留原始文件引用与文本 */
  sourceFile?: {
    name: string;
    type: string;
    size: number;
    storageKey: string;
  };
  rawText?: string;
}

export function createEmptyProfile(id: string, name: string): CnProfile {
  return {
    id,
    name,
    createdAt: new Date().toISOString(),
    basic: { name: '', phone: '', email: '' },
    education: { school: '', degree: '', major: '' },
    intention: {},
    links: {},
    texts: {},
    attachments: {},
    custom: {},
  };
}

/** 把任意 JSON（用户手写的 profile.json）收敛成合法的 CnProfileData。 */
export function normalizeCnProfileData(input: unknown): CnProfileData {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};

  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;

  const group = (key: string): Record<string, unknown> => {
    const value = source[key];
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  };

  const basic = group('basic');
  const education = group('education');
  const intention = group('intention');
  const links = group('links');
  const texts = group('texts');
  const attachments = group('attachments');
  const customSource = group('custom');

  const custom: Record<string, string> = {};
  for (const [key, value] of Object.entries(customSource)) {
    const entry = text(value);
    if (entry) {
      custom[key.trim()] = entry;
    }
  }

  return {
    basic: {
      name: text(basic.name) ?? '',
      gender: text(basic.gender),
      birthDate: text(basic.birthDate),
      nation: text(basic.nation),
      politicalStatus: text(basic.politicalStatus),
      idCard: text(basic.idCard),
      phone: text(basic.phone) ?? '',
      email: text(basic.email) ?? '',
      wechat: text(basic.wechat),
      qq: text(basic.qq),
      city: text(basic.city),
      address: text(basic.address),
      hometown: text(basic.hometown),
      emergencyContact: text(basic.emergencyContact),
      emergencyPhone: text(basic.emergencyPhone),
      englishLevel: text(basic.englishLevel),
    },
    education: {
      school: text(education.school) ?? '',
      degree: text(education.degree) ?? '',
      major: text(education.major) ?? '',
      enrollmentDate: text(education.enrollmentDate),
      graduationDate: text(education.graduationDate),
      gpa: text(education.gpa),
      ranking: text(education.ranking),
      fullTime: text(education.fullTime),
    },
    intention: {
      position: text(intention.position),
      expectedCity: text(intention.expectedCity),
      expectedSalary: text(intention.expectedSalary),
      availability: text(intention.availability),
      internshipDuration: text(intention.internshipDuration),
      jobType: text(intention.jobType),
    },
    links: {
      github: text(links.github),
      blog: text(links.blog),
      portfolio: text(links.portfolio),
      linkedin: text(links.linkedin),
    },
    texts: {
      selfIntro: text(texts.selfIntro),
      projectExp: text(texts.projectExp),
      internshipExp: text(texts.internshipExp),
      campusExp: text(texts.campusExp),
      awards: text(texts.awards),
      skills: text(texts.skills),
      researchDirection: text(texts.researchDirection),
      hobbies: text(texts.hobbies),
    },
    attachments: {
      resumeId: text(attachments.resumeId),
    },
    custom,
  };
}

/** 下拉可选值，供 options 表单与归一化共用 */
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

/**
 * 把 profile 摊平成「中文标签 -> 值」，供侧边栏树、AI prompt 与手动复制使用。
 * 中文标签直接来自投递表单上常见的字段名，比 JSON Resume 的英文键更好认。
 */
export function toLabeledRecord(profile: CnProfile): Record<string, string> {
  const pairs: Array<[string, string | undefined]> = [
    ['姓名', profile.basic.name],
    ['性别', profile.basic.gender],
    ['出生日期', profile.basic.birthDate],
    ['民族', profile.basic.nation],
    ['政治面貌', profile.basic.politicalStatus],
    ['身份证号', profile.basic.idCard],
    ['手机号', profile.basic.phone],
    ['邮箱', profile.basic.email],
    ['微信号', profile.basic.wechat],
    ['QQ', profile.basic.qq],
    ['所在城市', profile.basic.city],
    ['通讯地址', profile.basic.address],
    ['籍贯', profile.basic.hometown],
    ['紧急联系人', profile.basic.emergencyContact],
    ['紧急联系人电话', profile.basic.emergencyPhone],
    ['英语水平', profile.basic.englishLevel],
    ['学校', profile.education.school],
    ['学历', profile.education.degree],
    ['专业', profile.education.major],
    ['入学时间', profile.education.enrollmentDate],
    ['毕业时间', profile.education.graduationDate],
    ['GPA', profile.education.gpa],
    ['专业排名', profile.education.ranking],
    ['培养方式', profile.education.fullTime],
    ['应聘岗位', profile.intention.position],
    ['期望城市', profile.intention.expectedCity],
    ['期望薪资', profile.intention.expectedSalary],
    ['到岗时间', profile.intention.availability],
    ['可实习时长', profile.intention.internshipDuration],
    ['工作性质', profile.intention.jobType],
    ['GitHub', profile.links.github],
    ['博客', profile.links.blog],
    ['作品集', profile.links.portfolio],
    ['LinkedIn', profile.links.linkedin],
    ['自我介绍', profile.texts.selfIntro],
    ['项目经历', profile.texts.projectExp],
    ['实习经历', profile.texts.internshipExp],
    ['校园经历', profile.texts.campusExp],
    ['获奖情况', profile.texts.awards],
    ['技能', profile.texts.skills],
    ['研究方向', profile.texts.researchDirection],
    ['兴趣爱好', profile.texts.hobbies],
  ];

  const result: Record<string, string> = {};
  for (const [label, value] of pairs) {
    if (typeof value === 'string' && value.trim()) {
      result[label] = value.trim();
    }
  }
  for (const [key, value] of Object.entries(profile.custom ?? {})) {
    if (typeof value === 'string' && value.trim()) {
      result[key] = value.trim();
    }
  }
  return result;
}
