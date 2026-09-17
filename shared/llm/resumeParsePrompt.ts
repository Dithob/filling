import type { ChatMessage } from '../types';
import { getDictionary } from '../dictionary/store';
import type { FieldOptions } from '../dictionary/types';

/**
 * 把简历原文交给模型，让它直接吐出 CnProfile 形状的 JSON。
 *
 * 为什么目标形状是 CnProfile 而不是 JSON Resume：国内校招字段（民族 / 政治面貌 /
 * 身份证 / 籍贯 / 紧急联系人 / 英语水平 / 排名 / 培养方式 / 实习时长 / 研究方向）
 * 在 JSON Resume 里只能塞进 `meta.custom` 这个自由字典，模型根本不知道要填什么；
 * 而且落库还要多过一次有损的 bridge 转换。直接产出目标形状，路径最短。
 *
 * 为什么枚举值从字典读而不是写死在这里：字典（`shared/dictionary/defaults.json`
 * 的 `options` 段）是下拉可选值的**唯一来源**，匹配器靠这些精确值去认页面选项。
 * 写死第二份迟早漂移，读字典则意味着「改了字典，AI 的输出契约自动跟着改」——
 * 这才是「让 AI 输出规则能完美适配的 JSON」的落地方式。
 */

/** CnProfile 字段 -> 字典 options 里的键。 */
const ENUM_FIELDS: ReadonlyArray<readonly [path: string, optionKey: string]> = [
  ['basic.gender', 'gender'],
  ['education.degree', 'degree'],
  ['basic.politicalStatus', 'politicalStatus'],
  ['intention.jobType', 'jobType'],
  ['education.fullTime', 'fullTime'],
];

const OUTPUT_SHAPE_EXAMPLE = `{
  "basic": {
    "name": "张三",
    "gender": "男",
    "birthDate": "2001-03",
    "nation": "汉族",
    "politicalStatus": "共青团员",
    "phone": "13800000000",
    "email": "zhangsan@example.com",
    "city": "杭州",
    "hometown": "山东济南",
    "emergencyContact": "张父",
    "emergencyPhone": "13900000000",
    "englishLevel": "CET-6 560"
  },
  "education": {
    "school": "某某大学",
    "degree": "硕士",
    "major": "计算机科学与技术",
    "enrollmentDate": "2023-09",
    "graduationDate": "2026-06",
    "gpa": "3.8/4.0",
    "ranking": "5/120",
    "fullTime": "全日制"
  },
  "intention": {
    "position": "算法工程师",
    "expectedCity": "杭州",
    "jobType": "全职"
  },
  "links": { "github": "https://github.com/example" },
  "texts": {
    "selfIntro": "一段自我介绍。",
    "projectExp": "项目甲：做了什么。\\n\\n项目乙：做了什么。",
    "skills": "Python、PyTorch"
  },
  "custom": { "是否服从调剂": "是" }
}`;

function buildEnumSection(options: FieldOptions): string {
  const lines: string[] = [];
  for (const [path, optionKey] of ENUM_FIELDS) {
    const values = (options[optionKey] ?? []).filter((value) => value.trim().length > 0);
    if (values.length > 0) {
      lines.push(`- ${path}: ${values.join(' / ')}`);
    }
  }
  if (lines.length === 0) {
    return '';
  }
  return [
    '## 枚举字段的可选值（必须逐字照抄其中一个，不要改写、不要翻译）',
    lines.join('\n'),
  ].join('\n');
}

export function buildResumeParseMessages(rawText: string): ChatMessage[] {
  const enumSection = buildEnumSection(getDictionary().options);

  const system = [
    '你是中国校园招聘简历的结构化信息抽取器。把用户给出的简历原文转成一个 json 对象。',
    '',
    '## 输出规则',
    '- 只输出这一个 json 对象本身。不要输出解释、注释、Markdown 代码块围栏。',
    '- 只能使用下面列出的字段名，**不要自创字段**。',
    '- 简历里没有提到的字段直接省略。**绝对不要猜测、推断或编造**——宁可少一个字段，也不要填错。',
    '- 所有值都是字符串。日期统一写成 `YYYY-MM` 或 `YYYY-MM-DD`（知道具体日期才写日）。',
    '- `texts` 里的字段是整段文本：多个条目之间用**空行**分隔，条目内部用换行保留原有层次。',
    '- 技能、获奖、项目经历原文照搬，不要改写措辞，不要压缩成一句话。',
    enumSection,
    '',
    '## 输出形状（严格照此结构，字段按需增删，不要新增这里的字段）',
    OUTPUT_SHAPE_EXAMPLE,
    '',
    '## 各组字段的含义',
    '- basic：基本信息。nation 是民族（如 汉族）；hometown 是籍贯（如 山东济南）而不是现居城市。',
    '  politicalStatus 是政治面貌；englishLevel 是英语水平（如 CET-6 560 / 雅思 7.0 / 专八）。',
    '- education：教育经历，只保留最高学历那一段。gpa 形如 `3.8/4.0` 或 `88/100`；',
    '  ranking 是专业排名，形如 `5/120` 或 `前 10%`。',
    '- intention：求职意向。position 是目标岗位；expectedCity 是期望城市；',
    '  availability 是到岗时间；internshipDuration 是可实习时长。简历里没有明确写求职意向时留空。',
    '- links：链接，只填简历里出现过的完整 URL。',
    '- texts：整段文本。projectExp 是项目经历，internshipExp 是实习经历，campusExp 是校园经历/学生工作，',
    '  awards 是获奖情况，researchDirection 是研究方向或论文情况。',
    '- custom：兜底问答。只放「国内校招表单常问、但上面六组都没有对应字段」的信息，',
    '  键用简历里的原始问题措辞。不要把上面已有字段的重复内容塞进来。',
    '- attachments：**不要输出这个字段**，它只能由程序写入。',
  ].join('\n');

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: ['以下是从简历 PDF 里提取出来的原始文本：', '', rawText].join('\n'),
    },
  ];
}

/**
 * 校验失败后，把 AJV 的报错回喂给模型让它只修这一处。
 *
 * 这是「三段式」的最后一环：DeepSeek 不支持 `json_schema` 强约束，所以形状
 * 合规只能靠「提示词示例 → 本地校验 → 报错回喂」兜住。
 */
export function buildResumeRepairMessages(
  rawText: string,
  invalidJson: string,
  errors: string[],
): ChatMessage[] {
  const base = buildResumeParseMessages(rawText);
  return [
    base[0],
    base[1],
    {
      role: 'assistant',
      content: invalidJson,
    },
    {
      role: 'user',
      content: [
        '上面的 json 不符合要求，校验器报了这些错：',
        ...errors.map((error) => `- ${error}`),
        '',
        '请输出修正后的完整 json 对象。仍然只输出 json 本身，不要解释，不要代码块围栏。',
      ].join('\n'),
    },
  ];
}
