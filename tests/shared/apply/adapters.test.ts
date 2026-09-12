import { describe, expect, it } from 'vitest';
import { resolveSlotFromLabel, resolveSlotFromText, getAllAdapterIds } from '../../../shared/apply/slots';
import type { FieldSlot } from '../../../shared/apply/slotTypes';

const ADAPTERS = getAllAdapterIds();

/** 每个 slot 的真实表单标签样例（含带冒号 / 括号 / 前后缀的写法）。 */
const ZH_LABEL_CASES: Array<[FieldSlot, string[]]> = [
  ['name', ['姓名', '真实姓名', '姓名：', '中文姓名']],
  ['email', ['邮箱', '电子邮箱', '联系邮箱', '电子邮件']],
  ['phone', ['手机号', '联系电话', '手机号码', '联系方式']],
  ['city', ['所在城市', '城市', '现居城市']],
  ['state', ['省份', '省/直辖市', '自治区']],
  ['address', ['通讯地址', '详细地址', '联系地址']],
  ['birthDate', ['出生日期', '出生年月', '生日']],
  ['gender', ['性别']],
  ['educationSchool', ['毕业院校', '学校', '院校名称']],
  ['educationDegree', ['学历', '最高学历', '学位']],
  ['educationField', ['专业', '所学专业', '学习方向']],
  ['educationStartDate', ['入学时间', '入学日期']],
  ['educationEndDate', ['毕业时间', '毕业日期', '毕业年月']],
  ['educationGpa', ['GPA', '绩点', '平均分']],
  ['expectedSalary', ['期望薪资', '期望月薪', '薪资要求']],
  ['preferredLocation', ['期望城市', '意向城市', '期望工作地点']],
  ['availabilityDate', ['到岗时间', '可入职时间']],
  ['jobType', ['工作性质', '工作类型']],
  ['skills', ['技能特长', '技术栈', '擅长领域']],
  ['summary', ['自我介绍', '个人评价']],
  ['headline', ['应聘岗位', '意向岗位', '期望岗位']],
  ['nation', ['民族']],
  ['politicalStatus', ['政治面貌', '政治面目']],
  ['idCard', ['身份证号', '身份证号码', '证件号码']],
  ['hometown', ['籍贯', '祖籍', '生源地']],
  ['wechat', ['微信号']],
  ['qq', ['QQ号']],
  ['emergencyContact', ['紧急联系人姓名', '紧急联系人']],
  ['emergencyPhone', ['紧急联系电话', '紧急联系人手机']],
  ['englishLevel', ['英语水平', '英语等级', 'CET-6']],
  ['educationRanking', ['专业排名', '年级排名']],
  ['educationFullTime', ['培养方式', '学习形式']],
  ['internshipDuration', ['可实习时长', '实习周期']],
  ['internshipExp', ['实习经历', '实习经验']],
  ['projectExp', ['项目经历', '项目经验']],
  ['campusExp', ['校园经历', '学生工作']],
  ['awards', ['获奖情况', '荣誉奖项']],
  ['researchDirection', ['研究领域']],
  ['hobbies', ['兴趣爱好', '爱好特长']],
];

const EN_LABEL_CASES: Array<[FieldSlot, string[]]> = [
  ['name', ['Full name']],
  ['email', ['Email']],
  ['phone', ['Phone']],
  ['projectExp', ['Project experience']],
  ['internshipExp', ['Internship experience']],
  ['awards', ['Honors & awards']],
  ['politicalStatus', ['Political status']],
  ['idCard', ['ID number']],
  ['hometown', ['Native place']],
  ['emergencyPhone', ['Emergency contact phone']],
  ['educationRanking', ['Class ranking']],
  ['hobbies', ['Hobbies']],
  ['englishLevel', ['English level']],
];

/** 负例：这些页面文本不能被认成右边那个 slot（回归「最长命中优先」的价值）。 */
const NEGATIVE_CASES: Array<[string, FieldSlot]> = [
  ['杭州', 'state'],
  ['广东省', 'state'],
  ['专业排名', 'educationField'],
  ['紧急联系电话', 'phone'],
  ['紧急联系人姓名', 'name'],
  ['毕业时间', 'currentEndDate'],
  ['期望城市', 'city'],
  ['学历', 'educationField'],
  ['实习经历', 'currentCompany'],
  ['获奖情况', 'summary'],
  ['校园经历', 'educationSchool'],
  ['研究方向', 'educationField'],
  ['微信号', 'qq'],
];

describe('field adapters', () => {
  it('matches English labels by default', () => {
    expect(resolveSlotFromLabel('Email address')).toBe('email');
  });

  it('matches Chinese labels when adapters active', () => {
    expect(resolveSlotFromLabel('联系邮箱', ADAPTERS)).toBe('email');
    expect(resolveSlotFromLabel('联系电话', ADAPTERS)).toBe('phone');
  });

  it('identifies Chinese context strings', () => {
    expect(resolveSlotFromText('现公司：示例企业', ADAPTERS)).toBe('currentCompany');
  });

  it('falls back when adapter excluded', () => {
    expect(resolveSlotFromLabel('联系电话', ['en_default'])).toBeNull();
  });

  it.each(ZH_LABEL_CASES)('中文标签命中 %s', (slot, labels) => {
    for (const label of labels) {
      expect(resolveSlotFromLabel(label, ADAPTERS), `标签「${label}」`).toBe(slot);
    }
  });

  it.each(EN_LABEL_CASES)('英文标签命中 %s', (slot, labels) => {
    for (const label of labels) {
      expect(resolveSlotFromLabel(label, ADAPTERS), `label "${label}"`).toBe(slot);
    }
  });

  it.each(NEGATIVE_CASES)('负例「%s」不应命中 %s', (label, forbidden) => {
    expect(resolveSlotFromLabel(label, ADAPTERS)).not.toBe(forbidden);
  });

  it('中文词典整体命中率不低于 95%', () => {
    const cases = ZH_LABEL_CASES.flatMap(([slot, labels]) => labels.map((label) => ({ slot, label })));
    const hits = cases.filter(({ slot, label }) => resolveSlotFromLabel(label, ADAPTERS) === slot);
    const rate = hits.length / cases.length;
    expect(rate, `命中 ${hits.length}/${cases.length}`).toBeGreaterThanOrEqual(0.95);
  });
});
