import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseResumeWithAi, ResumeParseError } from '../../../shared/llm/resumeParse';
import { createDeepSeekProvider } from '../../../shared/storage/settings';
import type { ProviderConfig } from '../../../shared/types';

/**
 * 「一次解析 → 本地校验 → 回喂修复一次」这条流水线的端到端验证。
 *
 * 这里只 mock 掉 HTTP 那一层，其余（提示词构建、校验、修复重试、字段清洗）
 * 全走真实实现——它正是「DeepSeek 不支持 json_schema，所以形状合规要靠
 * 提示词 + 校验 + 修复兜住」这个设计的验收点。
 */
const provider: ProviderConfig = createDeepSeekProvider('sk-test');
const RAW_TEXT = '张三，男，某大学计算机科学与技术专业，2026 年 6 月毕业。';

interface Captured {
  body: Record<string, unknown>;
}

function stubFetch(contents: string[]) {
  const captured: Captured[] = [];
  let call = 0;
  const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
    captured.push({ body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
    const content = contents[Math.min(call, contents.length - 1)];
    call += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { captured, fetchMock };
}

function lastUserMessage(captured: Captured[], index: number): string {
  const messages = captured[index].body.messages as Array<{ role: string; content: string }>;
  return messages[messages.length - 1].content;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseResumeWithAi', () => {
  it('一次通过时不触发修复', async () => {
    const { fetchMock } = stubFetch([
      '{"basic":{"name":"张三","gender":"男"},"education":{"degree":"硕士"}}',
    ]);

    const outcome = await parseResumeWithAi(provider, RAW_TEXT);

    expect(outcome.repaired).toBe(false);
    expect(outcome.data.basic.name).toBe('张三');
    expect(outcome.data.education.degree).toBe('硕士');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('形状不对时把 AJV 报错回喂，修好后标记 repaired', async () => {
    const { captured, fetchMock } = stubFetch([
      '{"basic":{"name":"张三","nickName":"小三"}}',
      '{"basic":{"name":"张三"}}',
    ]);

    const outcome = await parseResumeWithAi(provider, RAW_TEXT);

    expect(outcome.repaired).toBe(true);
    expect(outcome.data.basic.name).toBe('张三');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 第二次请求必须带着「哪个字段不合法」的原文，否则模型只能瞎猜。
    expect(lastUserMessage(captured, 1)).toContain('/basic/nickName is not allowed.');
  });

  it('输出不是 JSON 对象时同样走修复，而不是直接抛错', async () => {
    const { captured } = stubFetch([
      '抱歉，我需要更多信息。',
      '{"basic":{"name":"张三"}}',
    ]);

    const outcome = await parseResumeWithAi(provider, RAW_TEXT);

    expect(outcome.repaired).toBe(true);
    expect(lastUserMessage(captured, 1)).toContain('输出不是一个合法的 JSON 对象。');
  });

  it('裸对象外面裹了代码块围栏也能直接吃下，省掉一次往返', async () => {
    const { fetchMock } = stubFetch([
      '```json\n{"basic":{"name":"张三"}}\n```',
    ]);

    const outcome = await parseResumeWithAi(provider, RAW_TEXT);

    expect(outcome.repaired).toBe(false);
    expect(outcome.data.basic.name).toBe('张三');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('只修一轮：两次都不合规就以 ResumeParseError 交还用户', async () => {
    const { fetchMock } = stubFetch([
      '{"basic":{"nickName":"小三"}}',
      '{"basic":{"nickName":"小三"}}',
    ]);

    await expect(parseResumeWithAi(provider, RAW_TEXT)).rejects.toBeInstanceOf(ResumeParseError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('报错时带上校验明细，UI 才能说清是哪里不对', async () => {
    stubFetch(['{"basic":{"nickName":"小三"}}']);

    const error: unknown = await parseResumeWithAi(provider, RAW_TEXT).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ResumeParseError);
    expect((error as ResumeParseError).validationErrors).toEqual([
      '/basic/nickName is not allowed.',
    ]);
  });

  it('即便模型硬塞 attachments.resumeId 也会被清掉', async () => {
    // resumeId 指向本地简历库条目，编出来的 id 会让附件上传指向不存在的文件。
    const { fetchMock } = stubFetch([
      '{"basic":{"name":"张三"},"attachments":{"resumeId":"model-invented-id"}}',
    ]);

    const outcome = await parseResumeWithAi(provider, RAW_TEXT);

    expect(outcome.data.attachments.resumeId).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('模型把 hobbies 放在根级（它属于 texts）会被拦下并纠正', async () => {
    const { captured, fetchMock } = stubFetch([
      '{"basic":{"name":"张三"},"hobbies":"摄影"}',
      '{"basic":{"name":"张三"},"texts":{"hobbies":"摄影"}}',
    ]);

    const outcome = await parseResumeWithAi(provider, RAW_TEXT);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastUserMessage(captured, 1)).toContain('/hobbies is not allowed.');
    expect(outcome.repaired).toBe(true);
    expect(outcome.data.texts.hobbies).toBe('摄影');
  });
});
