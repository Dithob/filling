import { describe, expect, it } from 'vitest';
import type { ProfileRecord } from '../../../shared/types';
import { createEmptyProfile, type CnProfile } from '../../../shared/schema/cnProfile';
import { buildCustomAnswers, buildSlotValues } from '../../../shared/apply/profile';

function makeProfile(overrides?: Partial<CnProfile>): ProfileRecord {
  return {
    ...createEmptyProfile('profile-1', '算法岗'),
    basic: {
      name: '张三',
      gender: '男',
      birthDate: '2002-05-10',
      phone: '13800000000',
      email: 'zhangsan@example.com',
      city: '北京',
      address: '北京市海淀区',
    },
    education: {
      school: '示例大学',
      degree: '硕士',
      major: '计算机科学与技术',
      enrollmentDate: '2024-09-01',
      graduationDate: '2027-06-30',
      gpa: '3.8',
    },
    intention: {
      position: '算法工程师',
      expectedCity: '深圳',
      expectedSalary: '25k-35k',
      availability: '2027-07-01',
      jobType: '实习',
    },
    links: {
      github: 'https://github.com/zhangsan',
      blog: 'https://zhangsan.dev',
      linkedin: 'https://linkedin.com/in/zhangsan',
    },
    texts: {
      selfIntro: '熟悉深度学习与推荐系统',
      skills: 'Python, PyTorch',
    },
    custom: {
      政治面貌: '中共党员',
    },
    ...overrides,
  };
}

describe('buildSlotValues', () => {
  it('maps basic info', () => {
    const slots = buildSlotValues(makeProfile());
    expect(slots.name).toBe('张三');
    expect(slots.phone).toBe('13800000000');
    expect(slots.email).toBe('zhangsan@example.com');
    expect(slots.city).toBe('北京');
    expect(slots.address).toBe('北京市海淀区');
    expect(slots.gender).toBe('男');
    expect(slots.birthDate).toBe('2002-05-10');
  });

  it('maps education fields', () => {
    const slots = buildSlotValues(makeProfile());
    expect(slots.educationSchool).toBe('示例大学');
    expect(slots.educationDegree).toBe('硕士');
    expect(slots.educationField).toBe('计算机科学与技术');
    expect(slots.educationStartDate).toBe('2024-09-01');
    expect(slots.educationEndDate).toBe('2027-06-30');
    expect(slots.educationGpa).toBe('3.8');
  });

  it('maps intention fields', () => {
    const slots = buildSlotValues(makeProfile());
    expect(slots.headline).toBe('算法工程师');
    expect(slots.preferredLocation).toBe('深圳');
    expect(slots.expectedSalary).toBe('25k-35k');
    expect(slots.availabilityDate).toBe('2027-07-01');
    expect(slots.jobType).toBe('实习');
  });

  it('maps links and long text', () => {
    const slots = buildSlotValues(makeProfile());
    expect(slots.github).toBe('https://github.com/zhangsan');
    expect(slots.linkedin).toBe('https://linkedin.com/in/zhangsan');
    expect(slots.website).toBe('https://zhangsan.dev');
    expect(slots.summary).toBe('熟悉深度学习与推荐系统');
    expect(slots.skills).toBe('Python, PyTorch');
  });

  it('splits Chinese names, honouring compound surnames', () => {
    const single = buildSlotValues(makeProfile({ basic: { ...makeProfile().basic, name: '张三' } }));
    expect(single.lastName).toBe('张');
    expect(single.firstName).toBe('三');

    const compound = buildSlotValues(makeProfile({ basic: { ...makeProfile().basic, name: '欧阳明月' } }));
    expect(compound.lastName).toBe('欧阳');
    expect(compound.firstName).toBe('明月');
  });

  it('splits latin names by space', () => {
    const slots = buildSlotValues(makeProfile({ basic: { ...makeProfile().basic, name: 'Ada Lovelace' } }));
    expect(slots.firstName).toBe('Ada');
    expect(slots.lastName).toBe('Lovelace');
  });

  it('normalizes loose date input', () => {
    const slots = buildSlotValues(makeProfile({ education: { school: 'x', degree: '', major: '', graduationDate: '2027年6月' } }));
    expect(slots.educationEndDate).toBe('2027-06-01');
  });

  it('falls back to ranking when gpa is absent', () => {
    const slots = buildSlotValues(
      makeProfile({ education: { school: 'x', degree: '', major: '', gpa: '', ranking: '5/120' } }),
    );
    expect(slots.educationGpa).toBe('5/120');
  });

  it('exposes custom answers for unmatched open questions', () => {
    expect(buildCustomAnswers(makeProfile())).toEqual({ 政治面貌: '中共党员' });
  });

  it('maps the CN campus-recruitment slots', () => {
    const profile = makeProfile({
      basic: {
        ...makeProfile().basic,
        nation: '汉族',
        politicalStatus: '中共党员',
        idCard: '110101200001011234',
        hometown: '浙江宁波',
        wechat: 'zhangsan_wx',
        qq: '12345678',
        emergencyContact: '李四',
        emergencyPhone: '13900000000',
        englishLevel: 'CET-6',
      },
      education: { ...makeProfile().education, ranking: '5/120', fullTime: '全日制' },
      intention: { ...makeProfile().intention, internshipDuration: '6个月' },
      texts: {
        ...makeProfile().texts,
        internshipExp: '某厂后端实习',
        projectExp: '推荐系统',
        campusExp: '学生会技术部',
        awards: '国家奖学金',
        researchDirection: '推荐系统',
        hobbies: '长跑',
      },
    });
    const slots = buildSlotValues(profile);

    expect(slots.nation).toBe('汉族');
    expect(slots.politicalStatus).toBe('中共党员');
    expect(slots.idCard).toBe('110101200001011234');
    expect(slots.hometown).toBe('浙江宁波');
    expect(slots.wechat).toBe('zhangsan_wx');
    expect(slots.qq).toBe('12345678');
    expect(slots.emergencyContact).toBe('李四');
    expect(slots.emergencyPhone).toBe('13900000000');
    expect(slots.englishLevel).toBe('CET-6');
    expect(slots.educationRanking).toBe('5/120');
    expect(slots.educationFullTime).toBe('全日制');
    expect(slots.internshipDuration).toBe('6个月');
    expect(slots.internshipExp).toBe('某厂后端实习');
    expect(slots.projectExp).toBe('推荐系统');
    expect(slots.campusExp).toBe('学生会技术部');
    expect(slots.awards).toBe('国家奖学金');
    expect(slots.researchDirection).toBe('推荐系统');
    expect(slots.hobbies).toBe('长跑');
  });

  it('does not emit CN slots for a profile without those fields', () => {
    const slots = buildSlotValues(makeProfile());
    expect(slots.nation).toBeUndefined();
    expect(slots.idCard).toBeUndefined();
    expect(slots.projectExp).toBeUndefined();
  });

  it('returns an empty map for a blank profile', () => {
    expect(Object.keys(buildSlotValues(createEmptyProfile('p', '空方案'))).length).toBe(0);
    expect(buildSlotValues(null)).toEqual({});
  });
});
