import { describe, expect, it } from 'vitest';
import { createEmptyProfile, type CnProfile } from '../../../shared/schema/cnProfile';
import {
  cnProfileDataFromResume,
  cnProfileFieldsFromResume,
  mergeCnProfileData,
  resumeFromCnProfile,
} from '../../../shared/schema/cnProfileBridge';

type Recordish = Record<string, unknown>;

function makeProfile(): CnProfile {
  const profile = createEmptyProfile('profile-1', '算法岗');
  return {
    ...profile,
    basic: {
      name: '张三',
      gender: '男',
      birthDate: '2002-05-10',
      nation: '汉族',
      politicalStatus: '中共党员',
      idCard: '110101200001011234',
      phone: '13800000000',
      email: 'zhangsan@example.com',
      wechat: 'zhangsan_wx',
      qq: '12345678',
      city: '杭州',
      address: '浙江省杭州市西湖区',
      hometown: '浙江宁波',
      emergencyContact: '李四',
      emergencyPhone: '13900000000',
      englishLevel: 'CET-6',
    },
    education: {
      school: '示例大学',
      degree: '硕士',
      major: '计算机科学与技术',
      enrollmentDate: '2024-09-01',
      graduationDate: '2027-06-30',
      gpa: '3.8',
      ranking: '5/120',
      fullTime: '全日制',
    },
    intention: {
      position: '算法工程师',
      expectedCity: '杭州',
      expectedSalary: '25k-35k',
      availability: '2027-07-01',
      internshipDuration: '6个月',
      jobType: '全职',
    },
    links: {
      github: 'https://github.com/zhangsan',
      blog: 'https://zhangsan.dev',
      portfolio: 'https://zhangsan.dev/portfolio',
      linkedin: 'https://linkedin.com/in/zhangsan',
    },
    texts: {
      selfIntro: '熟悉深度学习与推荐系统',
      projectExp: '推荐系统\n负责召回与排序\n\n知识图谱\n负责实体对齐',
      awards: '国家奖学金 · 教育部 · 2025',
      skills: 'Python, PyTorch',
      researchDirection: '推荐系统',
    },
    custom: {
      政治面貌: '中共党员',
      是否服从调剂: '是',
    },
  };
}

/**
 * 模拟 options 旧表单的往返：ProfileForm 只认识 meta 的三个固定字段，
 * 修复后额外透传 meta.custom（keepCustom=true）。
 */
function throughLegacyForm(resume: Recordish, options: { keepCustom: boolean }): Recordish {
  const meta = (resume.meta ?? {}) as Recordish;
  return {
    ...resume,
    meta: {
      canonical: meta.canonical ?? '',
      version: meta.version ?? '',
      lastModified: meta.lastModified ?? '',
      ...(options.keepCustom ? { custom: meta.custom ?? {} } : {}),
    },
  };
}

describe('resumeFromCnProfile', () => {
  it('把中文专属字段塞进 meta.custom，供旧表单透传', () => {
    const resume = resumeFromCnProfile(makeProfile());
    const custom = (resume.meta as Recordish).custom as Recordish;

    expect(custom.nation).toBe('汉族');
    expect(custom.politicalStatus).toBe('中共党员');
    expect(custom.idCard).toBe('110101200001011234');
    expect(custom.hometown).toBe('浙江宁波');
    expect(custom.englishLevel).toBe('CET-6');
    expect(custom.ranking).toBe('5/120');
    expect(custom.internshipDuration).toBe('6个月');
  });

  it('项目经历 / 获奖情况落到结构化段落，空行分段保留', () => {
    const resume = resumeFromCnProfile(makeProfile());
    const projects = resume.projects as Array<Recordish>;
    expect(projects).toHaveLength(2);
    expect(projects[0].description).toBe('推荐系统\n负责召回与排序');
    expect(projects[1].description).toBe('知识图谱\n负责实体对齐');

    const awards = resume.awards as Array<Recordish>;
    expect(awards).toHaveLength(1);
    expect(awards[0].title).toBe('国家奖学金 · 教育部 · 2025');
  });
});

describe('mergeCnProfileData', () => {
  it('patch 里 undefined 的键保留 base 原值', () => {
    const base = makeProfile();
    const merged = mergeCnProfileData(base, {
      basic: { ...base.basic, nation: undefined, politicalStatus: undefined, idCard: undefined },
    });

    expect(merged.basic.nation).toBe('汉族');
    expect(merged.basic.politicalStatus).toBe('中共党员');
    expect(merged.basic.idCard).toBe('110101200001011234');
  });

  it('空字符串仍然生效，用户可以把表单拥有的字段清掉', () => {
    const base = makeProfile();
    const merged = mergeCnProfileData(base, {
      basic: { ...base.basic, email: '', phone: '' },
    });

    expect(merged.basic.email).toBe('');
    expect(merged.basic.phone).toBe('');
  });

  it('custom 整体替换（表单拥有它，因此可以清空）', () => {
    const base = makeProfile();
    expect(mergeCnProfileData(base, { custom: {} }).custom).toEqual({});
    expect(mergeCnProfileData(base, { custom: { 新问题: '新答案' } }).custom).toEqual({
      新问题: '新答案',
    });
    // patch 里完全没有 custom 时保留原表
    expect(mergeCnProfileData(base, { basic: base.basic }).custom).toEqual(base.custom);
  });

  it('patch 为空对象时各分组原样保留', () => {
    const base = makeProfile();
    const merged = mergeCnProfileData(base, {});

    expect(merged.basic).toEqual(base.basic);
    expect(merged.education).toEqual(base.education);
    expect(merged.intention).toEqual(base.intention);
    expect(merged.links).toEqual(base.links);
    expect(merged.texts).toEqual(base.texts);
    expect(merged.custom).toEqual(base.custom);
  });
});

describe('表单往返', () => {
  it('修复后的表单：中文专属字段与 custom 全部保留', () => {
    const profile = makeProfile();
    const resume = resumeFromCnProfile(profile);
    const patch = cnProfileFieldsFromResume(throughLegacyForm(resume, { keepCustom: true }));
    const saved = mergeCnProfileData(profile, patch);

    expect(saved.basic).toEqual(profile.basic);
    expect(saved.education).toEqual(profile.education);
    expect(saved.intention).toEqual(profile.intention);
    expect(saved.links).toEqual(profile.links);
    // skills 在 JSON Resume 里是数组，往返后分隔符统一成 ' | '（值不丢，只是写法归一）
    expect(saved.texts).toEqual({ ...profile.texts, skills: 'Python | PyTorch' });
    expect(saved.custom).toEqual(profile.custom);
  });

  it('即使表单丢掉了 meta.custom，中文专属字段也不会被清空', () => {
    const profile = makeProfile();
    const resume = resumeFromCnProfile(profile);
    const patch = cnProfileFieldsFromResume(throughLegacyForm(resume, { keepCustom: false }));
    const saved = mergeCnProfileData(profile, patch);

    expect(saved.basic.nation).toBe('汉族');
    expect(saved.basic.politicalStatus).toBe('中共党员');
    expect(saved.basic.idCard).toBe('110101200001011234');
    expect(saved.basic.hometown).toBe('浙江宁波');
    expect(saved.education.ranking).toBe('5/120');
    expect(saved.intention.internshipDuration).toBe('6个月');
  });

  it('在表单里编辑基础字段会写入存储', () => {
    const profile = makeProfile();
    const resume = resumeFromCnProfile(profile);
    const edited = throughLegacyForm(
      { ...resume, basics: { ...(resume.basics as Recordish), name: '张三丰', email: 'new@example.com' } },
      { keepCustom: true },
    );
    const saved = mergeCnProfileData(profile, cnProfileFieldsFromResume(edited));

    expect(saved.basic.name).toBe('张三丰');
    expect(saved.basic.email).toBe('new@example.com');
    expect(saved.basic.nation).toBe('汉族');
  });

  it('在扩展字段编辑器里改答案会落盘', () => {
    const profile = makeProfile();
    const resume = resumeFromCnProfile(profile);
    const meta = resume.meta as Recordish;
    const edited = throughLegacyForm(
      {
        ...resume,
        meta: { ...meta, custom: { ...(meta.custom as Recordish), 是否服从调剂: '否' } },
      },
      { keepCustom: true },
    );
    const saved = mergeCnProfileData(profile, cnProfileFieldsFromResume(edited));

    expect(saved.custom).toEqual({ 政治面貌: '中共党员', 是否服从调剂: '否' });
  });

  it('项目经历 / 获奖情况往返稳定', () => {
    const profile = makeProfile();
    const resume = resumeFromCnProfile(profile);
    const patch = cnProfileFieldsFromResume(throughLegacyForm(resume, { keepCustom: true }));
    const saved = mergeCnProfileData(profile, patch);

    expect(saved.texts.projectExp).toBe(profile.texts.projectExp);
    expect(saved.texts.awards).toBe(profile.texts.awards);
  });

  it('在表单里结构化编辑项目后能落成文本', () => {
    const profile = makeProfile();
    const resume = resumeFromCnProfile(profile);
    const edited = throughLegacyForm(
      {
        ...resume,
        projects: [
          { name: '电商推荐', description: '负责排序模型', highlights: ['CTR +12%'] },
          { name: '', description: '知识图谱', highlights: [] },
        ],
      },
      { keepCustom: true },
    );
    const saved = mergeCnProfileData(profile, cnProfileFieldsFromResume(edited));

    expect(saved.texts.projectExp).toBe(
      '电商推荐\n负责排序模型\n· CTR +12%\n\n知识图谱',
    );
  });
});

describe('cnProfileDataFromResume', () => {
  it('兼容只有 meta.custom 的旧数据', () => {
    const data = cnProfileDataFromResume({
      basics: { name: '李四' },
      meta: { custom: { nation: '回族', projectExp: '旧项目' } },
    });

    expect(data.basic.nation).toBe('回族');
    expect(data.texts.projectExp).toBe('旧项目');
  });
});
