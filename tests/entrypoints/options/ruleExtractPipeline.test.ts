import { describe, expect, it } from 'vitest';
import { extractResumeFromText } from '../../../shared/pdf/ruleExtract';
import {
  cnProfileDataFromResume,
  cnProfileFieldsFromResume,
  mergeCnProfileData,
  resumeFromCnProfile,
} from '../../../shared/schema/cnProfileBridge';
import { createEmptyProfile } from '../../../shared/schema/cnProfile';
import { validateResume } from '../../../shared/validate';
import {
  createEmptyResumeFormValues,
  formValuesToResume,
  mergeResumeFormValues,
  resumeToFormValues,
} from '../../../entrypoints/options/components/ProfileForm';

/**
 * 这条链路正是 useProfilesManager.processFile 的 `mode === 'rule'` 分支：
 * PDF 文本 -> extractResumeFromText -> 表单值 -> 合并 -> 回写 resume -> 校验 -> 落库字段。
 *
 * 之所以要覆盖整条链路（而不是只测 extractResumeFromText），是因为国内扩展字段
 * （民族 / 政治面貌 / 身份证号 / 英语水平 / 排名…）借道 `meta.custom` 传输，
 * 中间任何一环把自定义项丢掉，抽取结果就会「看起来成功、实际字段全空」。
 */

const SAMPLE = `张伟
男 | 1999-03-12 | 汉族 | 中共党员
手机：13800138000  邮箱：zhangwei@example.com
身份证号：110101199903120011
微信：zhangwei_wx  QQ：123456789
籍贯：山东省济南市
紧急联系人：张建国  紧急联系电话：13900139000

教育经历
2021-09 - 2025-06  清华大学  计算机科学与技术  本科  专业排名 3/120
主修课程：数据结构、操作系统、机器学习

英语水平
CET-6 580

求职意向
可实习时长：3 个月

研究方向
多智能体强化学习

项目经历
2024-03 - 2024-09  校园二手交易平台  负责人
负责后端架构设计，支撑日均 5000 单。

获奖情况
2024 年 ACM-ICPC 区域赛银奖
2023 年国家奖学金
`;

function runRulePipeline(rawText: string) {
  const outcome = extractResumeFromText(rawText);

  // 与 hook 中 rule 分支完全一致的四步
  const formValues = resumeToFormValues(outcome.resume);
  const mergedValues = mergeResumeFormValues(createEmptyResumeFormValues(), formValues);
  const mergedResume = formValuesToResume(mergedValues);
  const validation = validateResume(mergedResume);

  return { outcome, mergedValues, mergedResume, validation };
}

describe('规则抽取端到端链路（零 AI）', () => {
  it('抽取结果能通过 JSON Resume 校验', () => {
    const { validation } = runRulePipeline(SAMPLE);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it('经历表单往返后，国内扩展字段仍然落在 meta.custom 上', () => {
    const { mergedValues, mergedResume } = runRulePipeline(SAMPLE);

    const custom = (mergedResume.meta as { custom?: Record<string, string> } | undefined)?.custom ?? {};
    expect(custom.nation).toBe('汉族');
    expect(custom.politicalStatus).toBe('中共党员');
    expect(custom.idCard).toBe('110101199903120011');
    expect(custom.wechat).toBe('zhangwei_wx');
    expect(custom.qq).toBe('123456789');
    expect(custom.hometown).toBe('山东省济南市');
    expect(custom.englishLevel).toContain('CET-6');
    expect(custom.ranking).toBe('3/120');
    expect(custom.researchDirection).toBe('多智能体强化学习');

    // 表单里也要看得见，否则用户无法在扩展字段编辑器里修正
    const keys = mergedValues.meta.custom.map((entry) => entry.key);
    expect(keys).toContain('idCard');
    expect(keys).toContain('englishLevel');
  });

  it('bridge 能把 meta.custom 还原成 CnProfile 的结构化字段', () => {
    const { mergedResume } = runRulePipeline(SAMPLE);
    const data = cnProfileDataFromResume(mergedResume);

    expect(data.basic?.name).toBe('张伟');
    expect(data.basic?.phone).toBe('13800138000');
    expect(data.basic?.email).toBe('zhangwei@example.com');
    expect(data.basic?.nation).toBe('汉族');
    expect(data.basic?.politicalStatus).toBe('中共党员');
    expect(data.basic?.idCard).toBe('110101199903120011');
    expect(data.basic?.hometown).toBe('山东省济南市');
    expect(data.education?.school).toBe('清华大学');
    expect(data.education?.major).toContain('计算机');
  });

  it('落库后扩展字段不会被当成用户自定义问答', () => {
    const { mergedResume } = runRulePipeline(SAMPLE);
    const fields = cnProfileFieldsFromResume(mergedResume);

    // customAnswers 只应保留非保留键
    const reserved = ['nation', 'politicalStatus', 'idCard', 'wechat', 'qq', 'hometown', 'englishLevel'];
    for (const key of reserved) {
      expect(fields.custom?.[key]).toBeUndefined();
    }
  });

  it('在已有档案上跑抽取时，用户自定义问答与未抽取字段都保留', () => {
    const existing = createEmptyProfile('test-profile', '测试档案');
    existing.intention.expectedCity = '上海';
    existing.custom = { 爱好: '篮球' };

    // 表单先由档案渲染出来（对应 hook 里 selectedProfile 变化时的 form.reset）
    const formValues = resumeToFormValues(resumeFromCnProfile(existing));
    // 再把规则抽取的结果合进去（对应 processFile 的 rule 分支）
    const { resume } = extractResumeFromText(SAMPLE);
    const merged = mergeResumeFormValues(formValues, resumeToFormValues(resume));
    const back = formValuesToResume(merged);
    const next = mergeCnProfileData(existing, cnProfileFieldsFromResume(back));

    // 抽取到的覆盖
    expect(next.basic.idCard).toBe('110101199903120011');
    expect(next.basic.nation).toBe('汉族');
    // 没抽取到的保持原值
    expect(next.intention.expectedCity).toBe('上海');
    // 用户自定义问答不能在导入 PDF 时被清掉
    expect(next.custom?.['爱好']).toBe('篮球');
  });

  it('OCR 无文本时不应抛出，而是返回空结果', () => {
    const outcome = extractResumeFromText('   \n\n  ');
    expect(outcome.hits).toEqual([]);
    const basics = (outcome.resume.basics ?? {}) as Record<string, unknown>;
    expect(basics.name).toBeUndefined();
  });
});
