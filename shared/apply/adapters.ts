import type { GeneratedI18nStructure } from '#i18n';
import type { FieldSlot } from './slotTypes';

type ZeroSubstitutionKey = {
  [K in keyof GeneratedI18nStructure]: GeneratedI18nStructure[K]['substitutions'] extends 0 ? K : never;
}[keyof GeneratedI18nStructure];

export interface FieldLabelAdapter {
  id: string;
  nameKey: ZeroSubstitutionKey;
  descriptionKey?: ZeroSubstitutionKey;
  matchers: Partial<Record<FieldSlot, RegExp[]>>;
}

const EN_MATCHERS: Partial<Record<FieldSlot, RegExp[]>> = {
  name: [/^name$/i, /^full\s*name$/i, /^your\s*name$/i],
  firstName: [/^first\s*name$/i, /^given[-\s]?name$/i],
  lastName: [/^last\s*name$/i, /^family[-\s]?name$/i, /^surname$/i],
  email: [/^e[-\s]?mail$/i, /^email\s*address$/i],
  phone: [/^phone/i, /^mobile$/i, /^telephone$/i],
  city: [/^city$/i, /^town$/i],
  country: [/^country$/i],
  state: [/^state$/i, /^province$/i, /^region$/i],
  postalCode: [/^postal\s*code$/i, /^zip$/i, /^zip\s*code$/i],
  address: [/^address$/i, /^street$/i, /^street\s*address$/i],
  birthDate: [/^date\s*of\s*birth$/i, /^birth\s*date$/i, /^dob$/i, /^birthday$/i],
  gender: [/^gender$/i, /^sex$/i],
  website: [/^website$/i, /^portfolio$/i, /^personal\s*site$/i],
  linkedin: [/^linkedin/i],
  github: [/^github/i],
  summary: [/^summary$/i, /^about\s+you$/i, /^bio$/i],
  headline: [/^headline$/i, /^current\s*role$/i, /^title$/i, /^position\s+applied/i, /^desired\s+position/i],
  currentCompany: [/^current\s*company$/i, /^employer$/i, /^organization$/i, /^company$/i],
  currentTitle: [/^current\s*(title|position)$/i, /^job\s*title$/i, /^role$/i],
  currentLocation: [/^current\s*location$/i, /^work\s*location$/i, /^office\s*location$/i],
  currentStartDate: [/^current\s*(employment|job)?\s*start/i, /^employment\s*start$/i, /^work\s*start$/i],
  currentEndDate: [/^current\s*(employment|job)?\s*end/i, /^employment\s*end$/i, /^work\s*end$/i, /^last\s*day$/i],
  educationSchool: [/^school$/i, /^university$/i, /^college$/i, /^institution$/i],
  educationDegree: [/^degree$/i, /^education\s*level$/i, /^qualification$/i],
  educationField: [/^major$/i, /^field\s*of\s*study$/i, /^discipline$/i],
  educationStartDate: [/^enrollment\s*date$/i, /^education\s*start$/i],
  educationEndDate: [/^graduation\s*date$/i, /^education\s*end$/i, /^completion\s*date$/i],
  educationGpa: [/^gpa$/i, /^grade$/i, /^grade\s*point$/i],
  expectedSalary: [/^expected\s*salary$/i, /^desired\s*salary$/i, /^salary\s*expectation$/i],
  preferredLocation: [/^preferred\s*location$/i, /^desired\s*location$/i, /^target\s*location$/i],
  availabilityDate: [/^availability$/i, /^available\s*from$/i, /^available\s*date$/i],
  jobType: [/^job\s*type$/i, /^employment\s*type$/i],
  skills: [/^skills$/i, /^skill\s*set$/i],
  nation: [/^ethnicity$/i, /^ethnic\s*group$/i, /^nationality\s*\(ethnic\)/i],
  politicalStatus: [/^political\s*status$/i, /^party\s*affiliation$/i],
  idCard: [/^id\s*(card|number)$/i, /^national\s*id/i, /^identity\s*number$/i],
  hometown: [/^native\s*place$/i, /^hometown$/i, /^place\s*of\s*origin$/i],
  wechat: [/^wechat$/i, /^weixin$/i],
  qq: [/^qq$/i, /^qq\s*number$/i],
  emergencyContact: [/^emergency\s*contact(\s*name)?$/i],
  emergencyPhone: [/^emergency\s*(contact\s*)?(phone|tel|mobile)/i],
  englishLevel: [/^english\s*(level|proficiency)$/i, /^cet[-\s]?\d?$/i],
  educationRanking: [/^(class|major|academic)\s*ranking$/i, /^rank$/i],
  educationFullTime: [/^study\s*mode$/i, /^full[-\s]?time\s*study$/i],
  internshipDuration: [/^internship\s*(duration|period|length)$/i, /^available\s*internship/i],
  internshipExp: [/^internship\s*(experience|history)$/i],
  projectExp: [/^project\s*(experience|history)$/i, /^projects$/i],
  campusExp: [/^campus\s*(experience|activities)$/i, /^student\s*(activities|leadership)$/i],
  awards: [/^awards?$/i, /^honors?$/i, /^honors?\s*(and|&)\s*awards?$/i],
  researchDirection: [/^research\s*(direction|area|interest)s?$/i],
  hobbies: [/^hobbies$/i, /^interests$/i, /^hobbies\s*(and|&)\s*interests$/i],
};

const ZH_CN_MATCHERS: Partial<Record<FieldSlot, RegExp[]>> = {
  name: [/姓名/, /真实姓名/, /^名字$/],
  lastName: [/姓$/, /姓氏/],
  email: [/邮箱/, /电子邮件/, /电子邮箱/],
  phone: [/^电话/, /手机/, /联系电话/, /^联系方式$/],
  city: [/城市/, /^市$/, /市$/, /所在地区/],
  country: [/国家/, /国籍/],
  // 只保留「省份」这类标签词：早先的 /州/ 会把「杭州」误判成省。
  state: [/省份/, /省\/?直辖市/, /自治区/, /^省$/],
  postalCode: [/邮编/, /邮政编码/],
  address: [/地址/, /通讯地址/, /联系地址/, /详细地址/],
  birthDate: [/出生日期/, /出生年月/, /生日/, /出生时间/],
  gender: [/性别/],
  website: [/网站/, /主页/, /网址/, /个人网站/],
  linkedin: [/领英/],
  github: [/github/i],
  summary: [/自我介绍/, /个人简介/, /自我评价/, /个人评价/],
  headline: [/应聘岗位/, /意向岗位/, /期望岗位/, /目标岗位/, /当前职位/, /现任职位/, /^职称$/, /^头衔$/],
  currentCompany: [/现单位/, /现公司/, /所在公司/, /工作单位/],
  currentTitle: [/^职位$/, /^岗位$/, /^职务$/, /^职称$/, /工作职位/, /工作职务/],
  currentLocation: [/工作地点/, /现居地/, /所在地点/, /办公地点/],
  currentStartDate: [/入职日期/, /入职时间/, /工作开始时间/],
  currentEndDate: [/离职日期/, /离职时间/, /工作结束时间/],
  educationSchool: [/学校/, /毕业院校/, /院校/],
  educationDegree: [/学历/, /学位/, /学历层次/],
  educationField: [/专业/, /学习方向/],
  educationStartDate: [/入学日期/, /入学时间/, /学习开始时间/],
  educationEndDate: [/毕业日期/, /毕业时间/, /毕业年月/],
  educationGpa: [/绩点/, /gpa/i, /平均分/, /平均成绩/],
  expectedSalary: [/期望薪资/, /薪资要求/, /期望工资/, /期望薪水/, /期望月薪/],
  preferredLocation: [/期望地点/, /意向城市/, /期望工作地点/, /目标城市/, /期望城市/, /意向地点/],
  availabilityDate: [/到岗时间/, /可入职时间/, /入职时间/, /可用时间/],
  jobType: [/工作性质/, /工作类型/, /职位类型/, /工作方式/],
  skills: [/技能/, /技能特长/, /技术栈/, /擅长领域/],
  nation: [/民族/],
  politicalStatus: [/政治面貌/, /政治面目/, /政治身份/],
  idCard: [/身份证号/, /身份证号码/, /证件号码/, /证件号/, /^身份证$/],
  hometown: [/籍贯/, /祖籍/, /生源地/],
  wechat: [/微信/, /微信号/],
  qq: [/qq/i],
  emergencyContact: [/紧急联系人姓名/, /紧急联系人/, /紧急联络人/],
  emergencyPhone: [/紧急联系电话/, /紧急联系人电话/, /紧急联系人手机/, /紧急联络电话/],
  englishLevel: [/英语水平/, /英语等级/, /外语水平/, /英语能力/, /cet/i],
  educationRanking: [/专业排名/, /年级排名/, /班级排名/, /^排名$/],
  educationFullTime: [/培养方式/, /学习形式/, /培养类型/],
  internshipDuration: [/可实习时长/, /实习时长/, /实习周期/, /可实习时间/, /实习时间/],
  internshipExp: [/实习经历/, /实习经验/, /实习情况/],
  projectExp: [/项目经历/, /项目经验/, /科研项目/, /项目介绍/, /项目描述/],
  campusExp: [/校园经历/, /校园活动/, /学生工作/, /社团经历/, /在校经历/],
  awards: [/获奖情况/, /奖励情况/, /荣誉奖项/, /所获奖励/, /获奖经历/],
  researchDirection: [/研究方向/, /研究领域/],
  hobbies: [/兴趣爱好/, /爱好特长/, /个人爱好/, /^爱好$/, /^特长$/],
};

const DEFAULT_ADAPTERS: FieldLabelAdapter[] = [
  {
    id: 'en_default',
    nameKey: 'adapters.items.en_default.name',
    descriptionKey: 'adapters.items.en_default.description',
    matchers: EN_MATCHERS,
  },
  {
    id: 'zh_cn',
    nameKey: 'adapters.items.zh_cn.name',
    descriptionKey: 'adapters.items.zh_cn.description',
    matchers: ZH_CN_MATCHERS,
  },
];

export function getLabelAdapters(selectedIds?: string[]): FieldLabelAdapter[] {
  if (!selectedIds || selectedIds.length === 0) {
    return DEFAULT_ADAPTERS;
  }
  const set = new Set(selectedIds);
  const filtered = DEFAULT_ADAPTERS.filter((adapter) => set.has(adapter.id));
  return filtered.length > 0 ? filtered : DEFAULT_ADAPTERS;
}

/**
 * 匹配策略：**最长命中优先**。
 *
 * 上游实现是「第一个命中的 slot 直接返回」，在中文标签上会系统性出错：
 * 「紧急联系电话」被 `phone` 的 /联系电话/ 抢先、「紧急联系人姓名」被 `name` 的 /姓名/ 抢先、
 * 「专业排名」被 `educationField` 的 /专业/ 抢先。改成按命中文本长度取最优，
 * 命中长度相同时保留声明顺序（稳定，不随遍历顺序抖动）。
 */
export function matchSlotWithAdapters(text: string, adapterIds?: string[]): FieldSlot | null {
  const normalizedVariants = buildVariants(text);
  if (normalizedVariants.length === 0) {
    return null;
  }
  const adapters = getLabelAdapters(adapterIds);
  let bestSlot: FieldSlot | null = null;
  let bestLength = 0;
  for (const adapter of adapters) {
    for (const [slot, patterns] of Object.entries(adapter.matchers) as [FieldSlot, RegExp[]][]) {
      if (!patterns || patterns.length === 0) {
        continue;
      }
      for (const variant of normalizedVariants) {
        for (const pattern of patterns) {
          const match = pattern.exec(variant);
          if (!match) {
            continue;
          }
          if (match[0].length > bestLength) {
            bestLength = match[0].length;
            bestSlot = slot;
          }
        }
      }
    }
  }
  return bestSlot;
}

function buildVariants(input: string): string[] {
  if (!input || typeof input !== 'string') {
    return [];
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return [];
  }
  const stripped = trimmed
    .replace(/[：:]/g, ' ')
    .replace(/[（）()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lower = stripped.toLowerCase();
  return Array.from(new Set([trimmed, stripped, lower]));
}

export function listAvailableAdapters(): FieldLabelAdapter[] {
  return DEFAULT_ADAPTERS;
}
