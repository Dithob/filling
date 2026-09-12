/**
 * Bridge between the flat CnProfile storage shape and the JSON Resume shape
 * the legacy options form still renders.
 *
 * The options page was built around JSON Resume (nested basics/work/education).
 * Rewriting it is a separate step; until then this bridge keeps storage flat
 * (CnProfile is the source of truth) while the form keeps seeing a resume.
 *
 * The conversion is intentionally lossy in one direction only: a student
 * profile has at most one education entry and no work history worth keeping.
 */
import type { CnProfile, CnProfileData } from './cnProfile';

type Recordish = Record<string, unknown>;

function asRecord(value: unknown): Recordish | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Recordish;
  }
  return undefined;
}

function str(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

const GENDER_TO_CN: Record<string, string> = {
  male: '男',
  m: '男',
  man: '男',
  female: '女',
  f: '女',
  woman: '女',
};

const DEGREE_TO_CN: Record<string, string> = {
  doctoral: '博士',
  phd: '博士',
  doctor: '博士',
  masters: '硕士',
  master: '硕士',
  postgraduate: '硕士',
  bachelors: '本科',
  bachelor: '本科',
  university: '本科',
  college: '本科',
  associate: '大专',
  diploma: '大专',
  highschool: '高中',
};

const JOB_TYPE_TO_CN: Record<string, string> = {
  'full-time': '全职',
  fulltime: '全职',
  'part-time': '兼职',
  parttime: '兼职',
  contract: '兼职',
  internship: '实习',
  intern: '实习',
};

function mapEnum(value: unknown, table: Record<string, string>): string | undefined {
  const text = str(value);
  if (!text) {
    return undefined;
  }
  const hit = table[text.toLowerCase()];
  if (hit) {
    return hit;
  }
  // 已经是中文就原样返回
  return text;
}

/**
 * `resumeFromCnProfile` 借用 meta.custom 承载这些结构化字段，
 * 反向转换时不能再把它们当成用户的「问题 -> 答案」兜底项。
 */
const RESERVED_CUSTOM_KEYS = new Set([
  'nation',
  'politicalStatus',
  'idCard',
  'wechat',
  'qq',
  'hometown',
  'emergencyContact',
  'emergencyPhone',
  'englishLevel',
  'ranking',
  'fullTime',
  'position',
  'expectedCity',
  'expectedSalary',
  'availabilityDate',
  'internshipDuration',
  'jobType',
  'portfolio',
  'projectExp',
  'awards',
  'researchDirection',
  'resumeId',
]);

/**
 * 把表单回来的 patch 合进已存 profile。
 *
 * 关键语义：**patch 里为 `undefined` 的键保留 base 原值**。
 * `cnProfileDataFromResume` 对「表单不拥有的字段」（民族/政治面貌/身份证号/籍贯/
 * 微信/QQ/紧急联系人/英语水平/排名/培养方式…）只能吐出 `undefined`，早期实现直接
 * `{...profile, ...patch}` 整组覆盖，保存一次就把这些字段清空。空字符串 `''` 仍然
 * 生效，因此用户依旧可以把表单拥有的字段清掉。
 */
export function mergeCnProfileData(
  base: CnProfileData,
  patch: Partial<CnProfileData> | null | undefined,
): CnProfileData {
  if (!patch) {
    return base;
  }
  return {
    basic: mergeGroup(base.basic, patch.basic),
    education: mergeGroup(base.education, patch.education),
    intention: mergeGroup(base.intention, patch.intention),
    links: mergeGroup(base.links, patch.links),
    texts: mergeGroup(base.texts, patch.texts),
    attachments: mergeGroup(base.attachments, patch.attachments),
    // custom 是表单拥有的一等字段（扩展字段编辑器），整体替换才允许清空。
    custom: patch.custom ? { ...patch.custom } : { ...base.custom },
  };
}

function mergeGroup<T extends object>(base: T, patch: T | undefined): T {
  if (!patch) {
    return base;
  }
  const merged: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    merged[key] = value;
  }
  return merged as T;
}

/** 把多行文本拆成条目（空行分段），供 projects / awards 回流。 */
function splitTextBlocks(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function joinProjectEntries(entries: unknown): string | undefined {
  if (!Array.isArray(entries)) {
    return undefined;
  }
  const blocks: string[] = [];
  for (const raw of entries) {
    const entry = asRecord(raw);
    if (!entry) {
      continue;
    }
    const headerParts = [str(entry.name), formatDateRange(entry.startDate, entry.endDate), str(entry.url)].filter(
      Boolean,
    );
    const highlights = Array.isArray(entry.highlights)
      ? entry.highlights.map((item) => str(item)).filter((item): item is string => Boolean(item))
      : [];
    const body = [str(entry.description), ...highlights.map((item) => `· ${item}`)].filter(Boolean).join('\n');
    const block = [headerParts.join(' · '), body].filter(Boolean).join('\n');
    if (block) {
      blocks.push(block);
    }
  }
  return blocks.length > 0 ? blocks.join('\n\n') : undefined;
}

function joinAwardEntries(entries: unknown): string | undefined {
  if (!Array.isArray(entries)) {
    return undefined;
  }
  const blocks: string[] = [];
  for (const raw of entries) {
    const entry = asRecord(raw);
    if (!entry) {
      continue;
    }
    const header = [str(entry.title), str(entry.awarder), str(entry.date)].filter(Boolean).join(' · ');
    const block = [header, str(entry.summary)].filter(Boolean).join('\n');
    if (block) {
      blocks.push(block);
    }
  }
  return blocks.length > 0 ? blocks.join('\n\n') : undefined;
}

function formatDateRange(start: unknown, end: unknown): string | undefined {
  const from = str(start);
  const to = str(end);
  if (from && to) {
    return `${from} – ${to}`;
  }
  return from ?? to;
}

export function cnProfileDataFromResume(resume: unknown): CnProfileData {
  const root = asRecord(resume) ?? {};
  const basics = asRecord(root.basics) ?? {};
  const location = asRecord(basics.location) ?? {};
  const education = asRecord(Array.isArray(root.education) ? root.education[0] : root.education) ?? {};
  const work = asRecord(Array.isArray(root.work) ? root.work[0] : root.work) ?? {};
  const meta = asRecord(root.meta) ?? {};
  const custom = { ...(asRecord(root.custom) ?? {}), ...(asRecord(meta.custom) ?? {}) };

  const profiles = Array.isArray(basics.profiles) ? basics.profiles : [];
  let linkedin: string | undefined;
  let github: string | undefined;
  for (const entry of profiles) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    const network = str(record.network)?.toLowerCase() ?? '';
    const url = str(record.url);
    if (!url) {
      continue;
    }
    if (!linkedin && network.includes('linkedin')) {
      linkedin = url;
    } else if (!github && network.includes('github')) {
      github = url;
    }
  }

  const skills = Array.isArray(root.skills)
    ? root.skills
        .map((entry) => {
          const record = asRecord(entry);
          if (!record) {
            return str(entry);
          }
          const name = str(record.name);
          const keywords = Array.isArray(record.keywords)
            ? record.keywords.map((item) => str(item)).filter(Boolean)
            : [];
          return [name, ...keywords].filter(Boolean).join(', ');
        })
        .filter((value): value is string => Boolean(value))
        .join(' | ')
    : undefined;

  const customAnswers: Record<string, string> = {};
  for (const [key, value] of Object.entries(custom)) {
    // 反向映射用这批 key 承载 CnProfile 的结构化字段（见 resumeFromCnProfile 的 extra），
    // 它们不是用户自定义的「问题 -> 答案」，回灌进 custom 会让扩展字段编辑器塞满噪音。
    if (RESERVED_CUSTOM_KEYS.has(key)) {
      continue;
    }
    const text = str(value);
    if (text) {
      customAnswers[key] = text;
    }
  }

  return {
    basic: {
      name: str(basics.name) ?? '',
      gender: mapEnum(basics.gender, GENDER_TO_CN),
      birthDate: str(basics.birthdate) ?? str(basics.birthday),
      phone: str(basics.phone) ?? '',
      email: str(basics.email) ?? '',
      city: str(location.city),
      address: str(location.address),
      nation: str(custom.nation),
      politicalStatus: str(custom.politicalStatus),
      idCard: str(custom.idCard),
      wechat: str(custom.wechat),
      qq: str(custom.qq),
      hometown: str(custom.hometown),
      emergencyContact: str(custom.emergencyContact),
      emergencyPhone: str(custom.emergencyPhone),
      englishLevel: str(custom.englishLevel),
    },
    education: {
      school: str(education.institution) ?? str(education.school) ?? '',
      degree: mapEnum(education.studyType ?? education.degree, DEGREE_TO_CN) ?? '',
      major: str(education.area) ?? str(education.major) ?? '',
      enrollmentDate: str(education.startDate),
      graduationDate: str(education.endDate),
      gpa: str(education.score) ?? str(education.gpa),
      ranking: str(custom.ranking),
      fullTime: str(custom.fullTime),
    },
    intention: {
      position: str(basics.label) ?? str(custom.position),
      expectedCity: str(custom.expectedCity) ?? str(custom.preferredLocation),
      expectedSalary: str(basics.expectedSalary) ?? str(custom.expectedSalary) ?? str(custom.salaryExpectation),
      availability: str(basics.availabilityDate) ?? str(custom.availabilityDate),
      internshipDuration: str(custom.internshipDuration),
      jobType: mapEnum(basics.employmentType ?? basics.jobType ?? custom.jobType, JOB_TYPE_TO_CN),
    },
    links: {
      github,
      linkedin,
      blog: str(basics.url),
      portfolio: str(custom.portfolio),
    },
    texts: {
      selfIntro: str(basics.summary),
      skills,
      // 项目/获奖走结构化段落（projects / awards），旧数据回落到 meta.custom。
      projectExp: joinProjectEntries(root.projects) ?? str(custom.projectExp),
      awards: joinAwardEntries(root.awards) ?? str(custom.awards),
      researchDirection: str(custom.researchDirection),
    },
    attachments: {
      resumeId: str(custom.resumeId),
    },
    custom: customAnswers,
  };
}

export function cnProfileFieldsFromResume(resume: unknown): CnProfileData {
  return cnProfileDataFromResume(resume);
}

/** 反向：把扁平 profile 还原成表单能渲染的 JSON Resume 结构。 */
export function resumeFromCnProfile(profile: CnProfile): Recordish {
  const { basic, education, intention, links, texts, custom } = profile;

  const profiles: Recordish[] = [];
  if (links?.linkedin) {
    profiles.push({ network: 'LinkedIn', url: links.linkedin });
  }
  if (links?.github) {
    profiles.push({ network: 'GitHub', url: links.github });
  }

  const extra: Recordish = { ...custom };
  if (basic?.nation) extra.nation = basic.nation;
  if (basic?.politicalStatus) extra.politicalStatus = basic.politicalStatus;
  if (basic?.idCard) extra.idCard = basic.idCard;
  if (basic?.wechat) extra.wechat = basic.wechat;
  if (basic?.qq) extra.qq = basic.qq;
  if (basic?.hometown) extra.hometown = basic.hometown;
  if (basic?.emergencyContact) extra.emergencyContact = basic.emergencyContact;
  if (basic?.emergencyPhone) extra.emergencyPhone = basic.emergencyPhone;
  if (basic?.englishLevel) extra.englishLevel = basic.englishLevel;
  if (education?.ranking) extra.ranking = education.ranking;
  if (education?.fullTime) extra.fullTime = education.fullTime;
  if (intention?.position) extra.position = intention.position;
  if (intention?.expectedCity) extra.expectedCity = intention.expectedCity;
  if (intention?.expectedSalary) extra.expectedSalary = intention.expectedSalary;
  if (intention?.availability) extra.availabilityDate = intention.availability;
  if (intention?.internshipDuration) extra.internshipDuration = intention.internshipDuration;
  if (intention?.jobType) extra.jobType = intention.jobType;
  if (links?.portfolio) extra.portfolio = links.portfolio;
  if (texts?.researchDirection) extra.researchDirection = texts.researchDirection;
  if (profile.attachments?.resumeId) extra.resumeId = profile.attachments.resumeId;

  return {
    basics: {
      name: basic?.name ?? '',
      email: basic?.email ?? '',
      phone: basic?.phone ?? '',
      gender: basic?.gender,
      birthdate: basic?.birthDate,
      url: links?.blog,
      summary: texts?.selfIntro,
      label: intention?.position,
      location: {
        city: basic?.city,
        address: basic?.address,
      },
      profiles,
    },
    education: [
      {
        institution: education?.school ?? '',
        studyType: education?.degree ?? '',
        area: education?.major ?? '',
        startDate: education?.enrollmentDate,
        endDate: education?.graduationDate,
        score: education?.gpa,
      },
    ],
    work: [
      {
        name: '',
        position: '',
      },
    ],
    skills: texts?.skills
      ? texts.skills.split(/[|,]/).map((token) => ({ name: token.trim() })).filter((entry) => entry.name)
      : [],
    // 校招简历的项目经历 / 获奖情况在 CnProfile 里是整段文本，这里合成单条目给旧表单一个可编辑入口。
    // 加入空行分段是为了让「一段文本 -> 多条目」能无损往返（见 splitTextBlocks）。
    projects: splitTextBlocks(texts?.projectExp).map((block) => ({ description: block })),
    awards: splitTextBlocks(texts?.awards).map((block) => ({ title: block })),
    meta: {
      custom: extra,
    },
  };
}
