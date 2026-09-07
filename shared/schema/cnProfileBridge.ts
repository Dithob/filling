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
      projectExp: str(custom.projectExp),
      awards: str(custom.awards),
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
  if (texts?.projectExp) extra.projectExp = texts.projectExp;
  if (texts?.awards) extra.awards = texts.awards;
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
    meta: {
      custom: extra,
    },
  };
}
