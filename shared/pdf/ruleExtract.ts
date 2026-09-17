import type { ResumeExtractionResult } from '../types';
import { getDictionary } from '../dictionary/store';

/**
 * 零 AI 的简历文本抽取。
 *
 * 定位很明确：**把格式规整、带标签的字段抓出来，剩下的交给用户手动补**。
 * 不追求把自由文本读懂——那是模型的事，而模型现在默认关闭。
 *
 * 因此这里以「标签锚定」为主：只有先匹配到 `姓名` / `手机` / `学历` 这类标签，
 * 才会去读它后面的值。好处是误报率低（宁可少抽也不抽错），代价是版式花哨的简历抽不全。
 *
 * 唯一的例外是民族与政治面貌——中文简历习惯把 `男 | 1999-03-12 | 汉族 | 中共党员`
 * 挤在个人信息行里、不给标签。这两个字段取值都是封闭集合（56 个民族 / 6 种政治面貌），
 * 于是改成白名单匹配，并且只在开头的个人信息块内进行，避免读进正文。
 *
 * 输出刻意保持 JSON Resume 形状，这样就能走与 AI 解析完全相同的那条链路：
 * resumeToFormValues -> form.reset -> formValuesToResume -> validateResume
 * -> cnProfileFieldsFromResume。国内扩展字段（民族 / 政治面貌 / 身份证号 …）
 * 走 meta.custom，由 cnProfileBridge 的 RESERVED_CUSTOM_KEYS 还原。
 */

export interface RuleExtractionOutcome {
  resume: ResumeExtractionResult;
  /** 成功抽到的字段（面向用户的中文名）。 */
  hits: string[];
  /** 没抽到、且值得提醒用户手动补的字段。 */
  misses: string[];
}

/** 常见小节标题。用于把「段落型」字段（自我评价、项目经历…）截断到下一节。 */
const SECTION_HEADINGS = [
  '个人信息',
  '基本信息',
  '联系方式',
  '教育背景',
  '教育经历',
  '学习经历',
  '学历信息',
  '实习经历',
  '实习经验',
  '工作经历',
  '工作经验',
  '项目经历',
  '项目经验',
  '科研经历',
  '校园经历',
  '校园活动',
  '学生工作',
  '社团经历',
  '获奖情况',
  '获奖经历',
  '荣誉奖项',
  '所获奖励',
  '专业技能',
  '技能特长',
  '技能清单',
  '研究方向',
  '自我评价',
  '自我介绍',
  '个人简介',
  '个人评价',
  '兴趣爱好',
  '兴趣特长',
];

const COLON = '[:：]';
/** 行内紧跟的「下一个标签」，用来把 `学历：本科 专业：计算机` 切开。 */
const NEXT_LABEL_RE = /\s*[\u4e00-\u9fa5A-Za-z]{2,8}[:：]/;
const PHONE_RE = /(?<!\d)(?:\+?86[-\s]?)?(1[3-9]\d{9})(?!\d)/;
const LANDLINE_RE = /(?<!\d)(0\d{2,3}[-\s]?\d{7,8})(?!\d)/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const ID_CARD_RE =
  /(?<![0-9Xx])[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?![0-9Xx])/;
const URL_RE = /https?:\/\/[^\s，,、）)]+|\bwww\.[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const DATE_TOKEN = '(\\d{4})\\s*(?:[./\\-]|年)?\\s*(\\d{1,2})?\\s*月?';
const DATE_RANGE_RE = new RegExp(
  `${DATE_TOKEN}\\s*(?:[-–~—至到]+|to)\\s*${DATE_TOKEN}|${DATE_TOKEN}\\s*(?:[-–~—至到]+|to)\\s*(至今|现在|今|present|now)`,
  'i',
);
const CN_NAME_RE = /^[\u4e00-\u9fa5][\u4e00-\u9fa5·]{1,5}$/;
const SCHOOL_RE = /[\u4e00-\u9fa5]{2,20}(?:大学|学院|学校|职业技术学院|高等专科学校)/;
const MAJOR_RE = /[\u4e00-\u9fa5A-Za-z]{2,20}专业/;
const POLITICAL_STATUS_RE =
  /(中共党员（含预备党员）|中共党员|中共预备党员|预备党员|共青团员|民主党派|无党派人士|群众)/;
/**
 * 56 个民族。
 *
 * 之所以用白名单而不是 `xx族` 通配，是因为通配会把正文里的「家族企业」「民族团结」
 * 当成民族；而民族名本身是个封闭集合，白名单的误报率是 0。
 */
const NATION_NAMES = [
  '汉族', '蒙古族', '回族', '藏族', '维吾尔族', '苗族', '彝族', '壮族', '布依族', '朝鲜族',
  '满族', '侗族', '瑶族', '白族', '土家族', '哈尼族', '哈萨克族', '傣族', '黎族', '傈僳族',
  '佤族', '畲族', '高山族', '拉祜族', '水族', '东乡族', '纳西族', '景颇族', '柯尔克孜族', '土族',
  '达斡尔族', '仫佬族', '羌族', '布朗族', '撒拉族', '毛南族', '仡佬族', '锡伯族', '阿昌族', '普米族',
  '塔吉克族', '怒族', '乌孜别克族', '俄罗斯族', '鄂温克族', '德昂族', '保安族', '裕固族', '京族', '塔塔尔族',
  '独龙族', '鄂伦春族', '赫哲族', '门巴族', '珞巴族', '基诺族',
];
/** 长的排前面，避免 `土族` 抢先匹配掉 `土家族`。 */
const NATION_NAME_RE = new RegExp([...NATION_NAMES].sort((a, b) => b.length - a.length).join('|'));
/**
 * 政治面貌的兜底扫描：字典里的规范值 + 几个常见但没进规范值的写法。
 *
 * 规范值取自字典（唯一来源），所以这里只在**正则构造时**读一次快照；
 * 兜底集合是抽取规则的一部分（「预备党员」这类写法要认得出来），留在代码里。
 */
const POLITICAL_STATUS_FALLBACK_RE = new RegExp(
  [
    ...(getDictionary().options.politicalStatus ?? []),
    '中共预备党员',
    '预备党员',
    '无党派人士',
  ]
    .sort((a, b) => b.length - a.length)
    .join('|'),
);
const ENGLISH_LEVEL_RE =
  /(CET[\s-]?[46]|大学英语[四六]级|英语[四六]级|专业[四八]级|TEM[\s-]?[48]|IELTS\s*[\d.]+|雅思\s*[\d.]+|TOEFL\s*\d+|托福\s*\d+|BEC\s*(?:初级|中级|高级)?)/i;
const RANKING_RE = /(\d{1,4}\s*(?:\/\s*\d{1,4}|%|名))/;
const GPA_RE = /(?:GPA|绩点|平均分|平均绩点|加权成绩)\s*[:：]?\s*(\d{1,3}(?:\.\d{1,2})?(?:\s*\/\s*\d{1,3}(?:\.\d{1,2})?)?)/i;
const STUDENT_TYPE_RE = /(全日制|非全日制)/;
const DEGREE_WORDS: Array<[RegExp, string]> = [
  [/博士后|博士研究生|博士|ph\.?d|doctora?l?/i, 'doctoral'],
  [/硕士研究生|硕士|研究生|master/i, 'masters'],
  [/大学本科|本科|学士|bachelor|undergraduate/i, 'bachelors'],
  [/大专|专科|高职|associate|diploma/i, 'associate'],
  [/高中|中专|senior\s*high/i, 'highschool'],
];

function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
}

function toLines(text: string): string[] {
  return normalizeText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** 联系方式类标签：出现在段落中间时，同样要当作小节边界切断。 */
const SECTION_BREAK_RE =
  /^(?:紧急联系人|紧急联络人|紧急联系电话|紧急联系人电话|紧急联系人手机|手机|手机号|电话|联系电话|邮箱|电子邮箱|微信|微信号|QQ|QQ号|身份证号|身份证号码)/;

function isSectionHeading(line: string): boolean {
  return SECTION_HEADINGS.includes(line.replace(/[:：\s]/g, ''));
}

/** 找出下一个小节标题的行号，用于截断段落型字段。 */
function findSectionEnd(lines: string[], from: number): number {
  for (let i = from; i < lines.length; i += 1) {
    if (isSectionHeading(lines[i]) || SECTION_BREAK_RE.test(lines[i])) {
      return i;
    }
  }
  return lines.length;
}

/**
 * 个人信息块：从开头到第一个小节标题（最多前 12 行）。
 *
 * 民族 / 政治面貌 这类字段在中文简历里经常不带标签，写成
 * `男 | 1999-03-12 | 汉族 | 中共党员`，只能靠全文匹配兜底。
 * 但把范围放开到全文就会把正文里的「服务群众」「家族企业」读成个人属性，
 * 所以限定在开头的个人信息块内。
 */
function personalInfoBlock(lines: string[]): string {
  const block: string[] = [];
  const limit = Math.min(lines.length, 12);
  for (let i = 0; i < limit; i += 1) {
    if (isSectionHeading(lines[i])) {
      break;
    }
    block.push(lines[i]);
  }
  return block.join('\n');
}

/** 民族名归一：`汉` 这类简写补成 `汉族`，不在白名单里就丢弃。 */
function normalizeNation(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const direct = value.match(NATION_NAME_RE)?.[0];
  if (direct) {
    return direct;
  }
  const compact = value.replace(/[\s:：]/g, '');
  const expanded = `${compact}族`;
  return compact.length > 0 && NATION_NAME_RE.test(expanded) ? expanded : undefined;
}

/** 教育经历行里不该被当成专业的 token。 */
const NON_MAJOR_RE =
  /(?:排名|GPA|绩点|成绩|平均分|学年|学制|时间|大学|学院|学校|中学|系$|校区|方向$)/i;

/**
 * 从教育经历的首行里取专业。
 *
 * 中文简历最常见的一行写法是「2021.09-2025.06  清华大学  计算机科学与技术  本科」：
 * 专业既不带「专业」二字，也没有「所学专业：」标签，只看字面无法与院系区分，
 * 只能靠位置判断。做法是把这一行的 token 切开，把已知的日期 / 学校 / 学历 /
 * 排名逐个剔掉，剩下的第一个像专业的 token 就是它。
 *
 * 仅在「带前缀的专业标签」与「`xx专业`」两条路都失败后才调用，所以不会覆盖更可靠的来源。
 */
function readMajorFromEducationBlock(block: string, school: string | undefined): string | undefined {
  const candidates = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const headerLine =
    (school ? candidates.find((line) => line.includes(school)) : undefined) ??
    candidates.find((line) => DATE_RANGE_RE.test(line));
  if (!headerLine) {
    return undefined;
  }

  const tokens = headerLine
    .replace(new RegExp(DATE_RANGE_RE.source, 'gi'), ' ')
    .split(/[\s|｜·、/／,，;；]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    if (token.length < 2 || token.length > 20) {
      continue;
    }
    if (!/[\u4e00-\u9fa5A-Za-z]/.test(token)) {
      continue;
    }
    if (school && (token.includes(school) || school.includes(token))) {
      continue;
    }
    if (NON_MAJOR_RE.test(token)) {
      continue;
    }
    if (matchDegree(token)) {
      continue;
    }
    return token.replace(/专业$/, '');
  }
  return undefined;
}

/**
 * 把「标签后面那一串」裁到只剩值本身。
 *
 * PDF 抽回来的行常把多个标签挤在一起（`学历：本科 专业：计算机`），所以要先在
 * 下一个「xx：」处切断。这里**不按标点切**，因为段落型/列表型字段（专业技能）
 * 的值本身就含顿号与逗号——标点切分留给只取单个值的 `readLabeled`。
 */
function trimInline(raw: string): string {
  return raw.replace(NEXT_LABEL_RE, '\n').split('\n')[0].trim();
}

/**
 * 命中「标签 + 值」的取值器。
 *
 * 先在同一行找 `标签[:：]?值`，找不到再看下一行——PDF 常把值换到下一行。
 */
function readLabeled(
  lines: string[],
  label: RegExp,
  options: { maxLength?: number; nextLine?: boolean } = {},
): string | undefined {
  const { maxLength = 40, nextLine = true } = options;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(label);
    if (!match || match.index === undefined) {
      continue;
    }
    const inline = trimInline(
      line.slice(match.index + match[0].length).replace(new RegExp(`^\\s*${COLON}?\\s*`), ''),
    )
      .split(/[，,、|;；]/)[0]
      .trim();
    if (inline.length > 0 && inline.length <= maxLength) {
      return inline;
    }
    if (nextLine && i + 1 < lines.length) {
      const candidate = trimInline(lines[i + 1])
        .split(/[，,、|;；]/)[0]
        .trim();
      if (candidate.length > 0 && candidate.length <= maxLength && !isSectionHeading(lines[i + 1])) {
        return candidate;
      }
    }
  }
  return undefined;
}

/** 在全文里找第一个匹配（取第一个捕获组，没有捕获组就取整个匹配）。 */
function readWholeText(pattern: RegExp, text: string): string | undefined {
  const match = text.match(pattern);
  if (!match) {
    return undefined;
  }
  const value = (match[1] ?? match[0]).trim();
  return value.length > 0 ? value : undefined;
}

/** 抓取「标签 -> 到下一节标题为止」的整段文本。 */
function readSection(lines: string[], label: RegExp, maxChars: number): string | undefined {
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(label);
    if (!match || match.index === undefined) {
      continue;
    }
    const sameLine = trimInline(
      lines[i].slice(match.index + match[0].length).replace(new RegExp(`^\\s*${COLON}?\\s*`), ''),
    );
    const body = [sameLine, ...lines.slice(i + 1, findSectionEnd(lines, i + 1))]
      .filter(Boolean)
      .join('\n')
      .trim();
    if (body.length > 0) {
      return body.slice(0, maxChars);
    }
  }
  return undefined;
}

function toIsoYearMonth(year: string, month?: string): string {
  return `${year}-${(month ?? '01').padStart(2, '0')}`;
}

function parseDateRange(text: string): { startDate?: string; endDate?: string; ongoing?: boolean } {
  const match = text.match(DATE_RANGE_RE);
  if (!match) {
    return {};
  }
  // 两个分支共用一个正则，捕获组位置随分支变化，按非空组定位。
  const [, sYear, sMonth, eYear, eMonth, openYear, openMonth, ongoing] = match;
  if (openYear) {
    return { startDate: toIsoYearMonth(openYear, openMonth), ongoing: Boolean(ongoing) };
  }
  return {
    startDate: sYear ? toIsoYearMonth(sYear, sMonth) : undefined,
    endDate: eYear ? toIsoYearMonth(eYear, eMonth) : undefined,
  };
}

function splitList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/[，,、;；/|·\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 30);
}

function matchDegree(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return DEGREE_WORDS.find(([pattern]) => pattern.test(value))?.[1];
}

/**
 * 从简历纯文本里抽取字段。纯函数，不依赖浏览器 API，便于单测。
 */
export function extractResumeFromText(rawText: string): RuleExtractionOutcome {
  const text = normalizeText(rawText);
  const lines = toLines(text);

  // ---- 先全部取值，再统一登记 hit/miss，避免同一个字段被算两次 ----
  const email = readWholeText(EMAIL_RE, text);
  const phone = readWholeText(PHONE_RE, text) ?? readWholeText(LANDLINE_RE, text);
  const idCard = readWholeText(ID_CARD_RE, text);
  const wechat = readLabeled(lines, /(?:微信号|微信|WeChat)/i, { maxLength: 30 });
  const qq = readLabeled(lines, /(?:QQ号|QQ号码|QQ)/i, { maxLength: 20 })?.match(/\d{5,12}/)?.[0];
  const emergencyContact = readLabeled(
    lines,
    /(?:紧急联系人|紧急联络人|紧急情况联系人)/,
    { maxLength: 20 },
  );
  const emergencyPhoneRaw = readLabeled(
    lines,
    /(?:紧急联系电话|紧急联系人电话|紧急联系人手机|紧急联络电话)/,
    { maxLength: 25 },
  );
  const emergencyPhone =
    emergencyPhoneRaw && /1[3-9]\d{9}/.test(emergencyPhoneRaw) ? emergencyPhoneRaw.match(/1[3-9]\d{9}/)![0] : undefined;
  const gender = readLabeled(lines, /性别/, { maxLength: 6 })?.match(/(男|女)/)?.[1];
  const birthRaw = readLabeled(lines, /(?:出生日期|出生年月|出生时间|生日|Date of Birth)/i, {
    maxLength: 25,
  });
  const birthParts = birthRaw?.match(/(\d{4})\s*(?:[./\-]|年)?\s*(\d{1,2})?/);
  const birthDate = birthParts?.[1] ? toIsoYearMonth(birthParts[1], birthParts[2]) : undefined;
  // 民族 / 政治面貌：先按标签读，读不到再到个人信息块里找（`男 | 汉族 | 中共党员` 很常见）。
  const header = personalInfoBlock(lines);
  const nation =
    normalizeNation(readLabeled(lines, /民族/, { maxLength: 10 })) ??
    normalizeNation(header.match(NATION_NAME_RE)?.[0]);
  const politicalStatus =
    readLabeled(lines, /(?:政治面貌|政治面目|政治身份)/, { maxLength: 20 })?.match(
      POLITICAL_STATUS_RE,
    )?.[1] ?? header.match(POLITICAL_STATUS_FALLBACK_RE)?.[0];
  const hometown = readLabeled(lines, /(?:籍贯|祖籍|生源地|户籍所在地)/, { maxLength: 20 });
  const address = readLabeled(lines, /(?:现居住地|通讯地址|联系地址|详细地址|家庭住址)/, {
    maxLength: 40,
  });
  const city = readLabeled(lines, /(?:现居城市|所在城市|现居地)/, { maxLength: 20 });
  const region = readLabeled(lines, /(?:所在省份|省份)/, { maxLength: 20 });

  const position = readLabeled(
    lines,
    /(?:求职意向|应聘岗位|意向岗位|目标岗位|期望职位|期望岗位|求职岗位|应聘职位)/,
    { maxLength: 30 },
  );
  const expectedCity = readLabeled(
    lines,
    /(?:期望城市|意向城市|期望工作地|期望工作地点|意向地点|目标城市)/,
    { maxLength: 20 },
  );
  const expectedSalary = readLabeled(lines, /(?:期望薪资|期望月薪|薪资要求|期望工资|期望薪水)/, {
    maxLength: 25,
  });
  const availabilityDate = readLabeled(lines, /(?:到岗时间|可入职时间|入职时间|最快到岗)/, {
    maxLength: 25,
  });
  const internshipDuration = readLabeled(lines, /(?:可实习时长|实习时长|实习周期|可实习时间)/, {
    maxLength: 25,
  });

  const school =
    readWholeText(SCHOOL_RE, text) ??
    readLabeled(lines, /(?:毕业院校|学校名称|就读院校|院校|学校)/, { maxLength: 30 });
  const degreeLabel = readLabeled(lines, /(?:学历层次|最高学历|培养层次|学历|学位)/, { maxLength: 12 });
  const educationBlock =
    readSection(lines, /(?:教育背景|教育经历|学习经历|学历信息)/, 600) ?? text.slice(0, 1500);
  // 学历优先读标签；读不到就在教育段落里找，且按「最高学历优先」判定——
  // 硕士简历同时写着本科与硕士，取硕士才是本人想要的。
  const degree = matchDegree(degreeLabel) ?? matchDegree(educationBlock);
  // 专业只认带明确前缀的标签；裸的 `专业` 会命中「专业排名」。
  const majorLabeled = readLabeled(lines, /(?:所学专业|专业名称|主修专业|就读专业|专业方向)/, {
    maxLength: 24,
  });
  const majorPattern = readWholeText(MAJOR_RE, text)?.replace(/专业$/, '');
  const major =
    majorLabeled ??
    (majorPattern && !/^(?:所学|主修|就读|专业)/.test(majorPattern) ? majorPattern : undefined) ??
    readMajorFromEducationBlock(educationBlock, school);
  const educationDates = parseDateRange(educationBlock);
  const gpa = readWholeText(GPA_RE, text);
  const ranking = readWholeText(
    RANKING_RE,
    readLabeled(lines, /(?:专业排名|年级排名|班级排名|排名)/, { maxLength: 20 }) ?? '',
  );
  const fullTime = readWholeText(STUDENT_TYPE_RE, text);
  const englishLevel = readWholeText(ENGLISH_LEVEL_RE, text);

  const summary = readSection(lines, /(?:自我评价|自我介绍|个人简介|个人评价|自我描述)/, 400);
  const skills = readSection(lines, /(?:专业技能|技能特长|技能清单|掌握技能)/, 300);
  const projectExp = readSection(lines, /(?:项目经历|项目经验|主要项目)/, 800);
  const awards = readSection(lines, /(?:获奖情况|获奖经历|荣誉奖项|所获奖励|奖励情况)/, 500);
  const researchDirection = readLabeled(lines, /(?:研究方向|研究领域)/, { maxLength: 60 });

  const urls = Array.from(text.matchAll(new RegExp(URL_RE, 'g'))).map((m) => m[0].replace(/[.,;]$/, ''));
  const linkedinUrl = urls.find((url) => /linkedin/i.test(url));
  const githubUrl = urls.find((url) => /github/i.test(url));

  // 姓名：优先标签；没有标签时退化到「首屏里像一个中文人名的短行」。
  const nameLabeled = readLabeled(lines, /(?:姓名|名字|Name)/i, { maxLength: 20 });
  const nameGuess = lines.slice(0, 6).find((line) => CN_NAME_RE.test(line.replace(/\s+/g, '')));
  const name = (nameLabeled ?? nameGuess)?.replace(/\s+/g, '');

  const hits: string[] = [];
  const misses: string[] = [];
  const register = (label: string, value: string | undefined, hitLabel = label) => {
    if (value && value.trim().length > 0) {
      hits.push(hitLabel);
      return value.trim();
    }
    misses.push(label);
    return undefined;
  };

  register('姓名', name, nameLabeled ? '姓名' : '姓名（推测）');
  register('手机号', phone);
  register('邮箱', email);
  register('身份证号', idCard);
  register('微信', wechat);
  register('QQ', qq);
  register('紧急联系人', emergencyContact);
  register('紧急联系电话', emergencyPhone);
  register('性别', gender);
  register('出生日期', birthDate);
  register('民族', nation);
  register('政治面貌', politicalStatus);
  register('籍贯', hometown);
  register('联系地址', address);
  register('求职意向', position);
  register('期望城市', expectedCity);
  register('期望薪资', expectedSalary);
  register('到岗时间', availabilityDate);
  register('可实习时长', internshipDuration);
  register('毕业院校', school);
  register('学历', degree);
  register('专业', major);
  register('入学时间', educationDates.startDate);
  register('毕业时间', educationDates.endDate);
  register('GPA', gpa);
  register('专业排名', ranking);
  register('培养方式', fullTime);
  register('英语水平', englishLevel);
  register('自我评价', summary);
  register('专业技能', skills);
  register('项目经历', projectExp);
  register('获奖情况', awards);
  register('研究方向', researchDirection);

  // ---- 组装成 JSON Resume 形状 ----
  const basics: Record<string, unknown> = {};
  if (name) basics.name = name;
  if (position) basics.label = position;
  if (email) basics.email = email;
  if (phone) basics.phone = phone;
  if (gender) basics.gender = gender === '男' ? 'male' : 'female';
  if (birthDate) basics.birthdate = birthDate;
  if (summary) basics.summary = summary;
  const homepageUrl = urls.find((url) => url !== linkedinUrl && url !== githubUrl);
  if (homepageUrl) basics.url = homepageUrl;

  const location: Record<string, unknown> = {};
  if (city) location.city = city;
  if (address) location.address = address;
  if (region) location.region = region;
  if (Object.keys(location).length > 0) basics.location = location;

  const profiles: Array<Record<string, unknown>> = [];
  if (linkedinUrl) profiles.push({ network: 'LinkedIn', url: linkedinUrl });
  if (githubUrl) profiles.push({ network: 'GitHub', url: githubUrl });
  if (profiles.length > 0) basics.profiles = profiles;

  const education: Array<Record<string, unknown>> = [];
  const educationEntry: Record<string, unknown> = {};
  if (school) educationEntry.institution = school;
  if (degree) educationEntry.studyType = degree;
  if (major) educationEntry.area = major;
  if (educationDates.startDate) educationEntry.startDate = educationDates.startDate;
  if (educationDates.endDate) educationEntry.endDate = educationDates.endDate;
  if (gpa) educationEntry.score = gpa;
  if (Object.keys(educationEntry).length > 0) education.push(educationEntry);

  // 国内扩展字段走 meta.custom，由 cnProfileBridge 的 RESERVED_CUSTOM_KEYS 还原。
  const custom: Record<string, string> = {};
  const customEntries: Array<[string, string | undefined]> = [
    ['nation', nation],
    ['politicalStatus', politicalStatus],
    ['idCard', idCard],
    ['wechat', wechat],
    ['qq', qq],
    ['hometown', hometown],
    ['emergencyContact', emergencyContact],
    ['emergencyPhone', emergencyPhone],
    ['englishLevel', englishLevel],
    ['ranking', ranking],
    ['fullTime', fullTime],
    ['internshipDuration', internshipDuration],
    ['researchDirection', researchDirection],
    ['projectExp', projectExp],
    ['awards', awards],
  ];
  for (const [key, value] of customEntries) {
    if (value && value.trim().length > 0) {
      custom[key] = value.trim();
    }
  }

  const resume: ResumeExtractionResult = {};
  if (Object.keys(basics).length > 0) resume.basics = basics;
  if (education.length > 0) resume.education = education;
  const skillKeywords = splitList(skills);
  if (skillKeywords.length > 0) resume.skills = [{ name: '专业技能', keywords: skillKeywords }];
  if (Object.keys(custom).length > 0) resume.meta = { custom };

  return { resume, hits, misses };
}
