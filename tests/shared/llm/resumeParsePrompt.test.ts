import { describe, expect, it } from 'vitest';
import {
  buildResumeParseMessages,
  buildResumeRepairMessages,
} from '../../../shared/llm/resumeParsePrompt';
import { getDictionary } from '../../../shared/dictionary/store';

/**
 * 这些断言守的是「让 AI 吐出规则能适配的 JSON」这件事的**唯一手段**。
 *
 * DeepSeek 的 response_format 只支持 `json_object`——它保证「是合法 JSON」，
 * 不保证字段名对。所以形状合规只能靠提示词，而官方文档对这个 mode 有两条硬性
 * 要求：prompt 里必须出现 "json" 字样、必须给出目标形状示例。两条都得钉住。
 */
const RAW_TEXT = '简历原文：张三，某大学计算机专业。';
const messages = buildResumeParseMessages(RAW_TEXT);
const system = messages[0].content;

describe('buildResumeParseMessages', () => {
  it('system 提示里出现官方要求的 "json" 关键字', () => {
    expect(system.toLowerCase()).toContain('json');
  });

  it('给出完整的输出形状示例，六组都在', () => {
    for (const group of ['basic', 'education', 'intention', 'links', 'texts', 'custom']) {
      expect(system, group).toContain(`"${group}"`);
    }
  });

  it('明确禁止编造字段与输出代码块围栏', () => {
    expect(system).toContain('不要自创字段');
    expect(system).toContain('不要猜测、推断或编造');
    expect(system).toContain('不要输出解释、注释、Markdown 代码块围栏');
  });

  it('枚举候选值来自字段字典，而不是写死在提示词里', () => {
    // 「让 AI 输出规则能完美适配的 JSON」的落地点：匹配器靠字典里的精确值去认
    // 页面下拉项，所以模型必须照抄这些值。字典改了，提示词自动跟着改。
    const options = getDictionary().options;
    for (const key of ['gender', 'degree', 'politicalStatus', 'jobType', 'fullTime']) {
      const values = (options[key] ?? []).join(' / ');
      expect(values.length, key).toBeGreaterThan(0);
      expect(system, key).toContain(values);
    }
  });

  it('把简历原文放进 user 消息', () => {
    expect(messages[1]).toEqual({
      role: 'user',
      content: `以下是从简历 PDF 里提取出来的原始文本：\n\n${RAW_TEXT}`,
    });
  });

  it('告诉模型不要输出 attachments（那只能由程序写入）', () => {
    expect(system).toContain('attachments');
    expect(system).toContain('不要输出这个字段');
  });
});

describe('buildResumeRepairMessages', () => {
  const invalid = '{"basic":{"name":"张三","nickName":"小三"}}';
  const repair = buildResumeRepairMessages(RAW_TEXT, invalid, ['/basic/nickName is not allowed.']);

  it('保留原始 system/user，再把错误回喂', () => {
    expect(repair).toHaveLength(4);
    expect(repair[0]).toEqual(messages[0]);
    expect(repair[1]).toEqual(messages[1]);
  });

  it('把上一次的非法输出作为 assistant 回合放回去', () => {
    expect(repair[2]).toEqual({ role: 'assistant', content: invalid });
  });

  it('逐条列出校验错误并要求只输出 json', () => {
    const last = repair[3];
    expect(last.role).toBe('user');
    expect(last.content).toContain('- /basic/nickName is not allowed.');
    expect(last.content).toContain('请输出修正后的完整 json 对象');
  });
});
