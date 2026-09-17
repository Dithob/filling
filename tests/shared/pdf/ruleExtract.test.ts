import { describe, expect, it } from 'vitest';
import { extractResumeFromText } from '../../../shared/pdf/ruleExtract';

/** 模拟 pdfjs 抽出来的文本：按可视行切开，标签与值同行。 */
const SAMPLE = [
  '个人简历',
  '姓名：张伟',
  '性别：男',
  '出生年月：2002年3月',
  '民族：汉族',
  '政治面貌：中共党员',
  '籍贯：江苏南京',
  '手机：13800000000',
  '邮箱：zhangwei@example.com',
  '微信：zhangwei_2002',
  'QQ：123456789',
  '身份证号：110101200203011234',
  '求职意向：后端开发工程师',
  '期望城市：南京',
  '期望薪资：20-30K',
  '到岗时间：2027年7月',
  '现居城市：南京市栖霞区',
  '紧急联系人：张建国',
  '紧急联系电话：13900000000',
  '教育背景',
  '2023.09-2027.06  示例大学  计算机科学与技术专业  本科',
  '培养方式：全日制',
  'GPA：3.8/4.0',
  '专业排名：3/120',
  '英语水平：CET-6',
  '项目经历',
  '高性能网关',
  '负责连接池优化，QPS 提升 3 倍。',
  '专业技能：Java、Python、MySQL、Redis',
  '获奖情况',
  '国家奖学金，2025',
  '自我评价',
  '扎实的计算机基础，熟悉分布式系统。',
].join('\n');

function basicsOf(resume: Record<string, unknown>): Record<string, unknown> {
  return (resume.basics as Record<string, unknown>) ?? {};
}

describe('extractResumeFromText', () => {
  it('pulls contact details out of labelled lines', () => {
    const { resume } = extractResumeFromText(SAMPLE);
    const basics = basicsOf(resume);

    expect(basics.name).toBe('张伟');
    expect(basics.email).toBe('zhangwei@example.com');
    expect(basics.phone).toBe('13800000000');
    expect(basics.gender).toBe('male');
    expect(basics.birthdate).toBe('2002-03');
  });

  it('never mistakes the 18-digit ID for a phone number', () => {
    const { resume } = extractResumeFromText(SAMPLE);
    const custom = (resume.meta as { custom: Record<string, string> }).custom;

    expect(custom.idCard).toBe('110101200203011234');
    expect(custom.emergencyPhone).toBe('13900000000');
    // 紧急联系电话不能被当成主手机号
    expect(basicsOf(resume).phone).not.toBe('13900000000');
  });

  it('maps the campus-recruiting extras into meta.custom', () => {
    const { resume } = extractResumeFromText(SAMPLE);
    const custom = (resume.meta as { custom: Record<string, string> }).custom;

    expect(custom.nation).toBe('汉族');
    expect(custom.politicalStatus).toBe('中共党员');
    expect(custom.hometown).toBe('江苏南京');
    expect(custom.wechat).toBe('zhangwei_2002');
    expect(custom.qq).toBe('123456789');
    expect(custom.englishLevel).toBe('CET-6');
    expect(custom.ranking).toBe('3/120');
    expect(custom.fullTime).toBe('全日制');
    expect(custom.emergencyContact).toBe('张建国');
  });

  it('reads education as one JSON-Resume entry', () => {
    const { resume } = extractResumeFromText(SAMPLE);
    const education = (resume.education as Array<Record<string, unknown>>)[0];

    expect(education.institution).toBe('示例大学');
    expect(education.studyType).toBe('bachelors');
    expect(education.area).toBe('计算机科学与技术');
    expect(education.startDate).toBe('2023-09');
    expect(education.endDate).toBe('2027-06');
    expect(education.score).toBe('3.8/4.0');
  });

  it('keeps list values intact instead of cutting at the first 、', () => {
    const { resume } = extractResumeFromText(SAMPLE);
    const skills = (resume.skills as Array<{ keywords: string[] }>)[0];

    expect(skills.keywords).toEqual(['Java', 'Python', 'MySQL', 'Redis']);
  });

  it('stops a section at the next heading, not at the end of the document', () => {
    const { resume } = extractResumeFromText(SAMPLE);
    const custom = (resume.meta as { custom: Record<string, string> }).custom;

    expect(basicsOf(resume).summary).toBe('扎实的计算机基础，熟悉分布式系统。');
    expect(custom.awards).toBe('国家奖学金，2025');
    expect(custom.projectExp).toContain('高性能网关');
    // 自我评价是最后一节，不能把项目经历的内容吞进来
    expect(String(basicsOf(resume).summary)).not.toContain('项目');
  });

  it('reports what it found and what still needs filling in', () => {
    const { hits, misses } = extractResumeFromText(SAMPLE);

    expect(hits).toContain('手机号');
    expect(hits).toContain('毕业院校');
    expect(hits).toContain('政治面貌');
    // 简历里没写的东西必须如实报缺，而不是编一个值
    expect(misses).toContain('可实习时长');
  });

  it('returns nothing rather than guessing when the PDF has no text layer', () => {
    const { resume, hits } = extractResumeFromText('   \n  \n');

    expect(resume).toEqual({});
    expect(hits).toEqual([]);
  });

  it('does not invent a name from arbitrary prose', () => {
    const { resume, hits } = extractResumeFromText('这是一段没有任何字段标签的说明文字。');

    expect(basicsOf(resume).name).toBeUndefined();
    expect(hits).toEqual([]);
  });

  describe('民族 / 政治面貌没有标签时', () => {
    const UNLABELLED = [
      '李娜',
      '女 | 2001-08-20 | 满族 | 共青团员',
      '手机：13700000000  邮箱：lina@example.com',
      '教育背景',
      '2020.09-2024.06  示例大学  软件工程专业  本科',
    ].join('\n');

    it('从个人信息行里认出民族与政治面貌', () => {
      const { resume } = extractResumeFromText(UNLABELLED);
      const custom = (resume.meta as { custom: Record<string, string> }).custom;

      expect(custom.nation).toBe('满族');
      expect(custom.politicalStatus).toBe('共青团员');
    });

    it('把「民族：汉」这类简写补成「汉族」', () => {
      const { resume } = extractResumeFromText('王强\n民族：汉\n政治面貌：中共党员\n');
      const custom = (resume.meta as { custom: Record<string, string> }).custom;

      expect(custom.nation).toBe('汉族');
      expect(custom.politicalStatus).toBe('中共党员');
    });

    it('不会把正文里的「少数民族」「群众」读成个人属性', () => {
      const { resume } = extractResumeFromText(
        [
          '赵敏',
          '手机：13600000000',
          '自我评价',
          '长期参与少数民族地区支教，累计服务群众 2000 余人次。',
          '担任家族企业顾问的经历让我熟悉成本核算。',
        ].join('\n'),
      );
      const custom = (resume.meta as { custom: Record<string, string> } | undefined)?.custom;

      // 个人信息块在第一个小节标题处就截断了，正文不该影响这两个字段
      expect(custom?.nation).toBeUndefined();
      expect(custom?.politicalStatus).toBeUndefined();
    });
  });

  describe('教育经历首行的专业', () => {
    function areaOf(text: string): unknown {
      const { resume } = extractResumeFromText(text);
      const education = resume.education as Array<Record<string, unknown>> | undefined;
      return education?.[0]?.area;
    }

    it('从「日期 学校 专业 学历」这种无标签写法里取到专业', () => {
      expect(
        areaOf('姓名：孙悦\n教育经历\n2021.09-2025.06  示例大学  软件工程  本科\n'),
      ).toBe('软件工程');
      // 学历排在专业前面的写法同样要能取到
      expect(
        areaOf('姓名：孙悦\n教育经历\n2021.09-2025.06  示例大学  本科  软件工程\n'),
      ).toBe('软件工程');
    });

    it('带「专业」二字时去掉后缀', () => {
      expect(
        areaOf('姓名：孙悦\n教育经历\n2021.09-2025.06  示例大学  数据科学与大数据技术专业  本科\n'),
      ).toBe('数据科学与大数据技术');
    });

    it('不会把院系名、排名或校名本身当成专业', () => {
      const { resume } = extractResumeFromText(
        '姓名：孙悦\n教育经历\n2021.09-2025.06  示例大学  计算机学院  专业排名 3/120\n',
      );
      const education = resume.education as Array<Record<string, unknown>> | undefined;

      expect(education?.[0]?.area).toBeUndefined();
      expect(education?.[0]?.institution).toBe('示例大学');
    });

    it('有「所学专业：」标签时以标签为准', () => {
      expect(
        areaOf(
          '姓名：孙悦\n所学专业：电子信息工程\n教育经历\n2021.09-2025.06  示例大学  电子信息工程  本科\n',
        ),
      ).toBe('电子信息工程');
    });
  });
});
