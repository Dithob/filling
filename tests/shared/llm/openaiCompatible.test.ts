import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  deepseekProviderOptions,
  promptOpenAiCompatible,
  type OpenAiCompatibleOptions,
} from '../../../shared/llm/openaiCompatible';
import { ProviderConfigurationError, ProviderInvocationError } from '../../../shared/llm/errors';
import type { ChatMessage } from '../../../shared/types';

const messages: ChatMessage[] = [
  { role: 'system', content: 'return json' },
  { role: 'user', content: 'resume text' },
];

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** 用一串预设响应替换 fetch，并把每次请求原样记下来。 */
function stubFetch(responses: Array<Response | (() => Response | Promise<Response>)>) {
  const captured: CapturedRequest[] = [];
  let call = 0;
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    captured.push({
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    const next = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return typeof next === 'function' ? await next() : next;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { captured, fetchMock };
}

function completion(content: string, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content, ...extra } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deepseekOptions(overrides: Partial<OpenAiCompatibleOptions> = {}): OpenAiCompatibleOptions {
  return { ...deepseekProviderOptions('sk-test'), ...overrides };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('promptOpenAiCompatible', () => {
  it('解析出 choices[0].message.content', async () => {
    stubFetch([completion('{"basic":{"name":"张三"}}')]);

    const raw = await promptOpenAiCompatible(deepseekOptions(), messages);

    expect(raw).toBe('{"basic":{"name":"张三"}}');
  });

  it('thinking 模式的思维链不会被当成结果', async () => {
    // DeepSeek 把推理过程放在 reasoning_content 里，它是过程不是答案；
    // 拿去 JSON.parse 会得到一个完全无关的对象。
    stubFetch([completion('{"ok":true}', { reasoning_content: '先想一下……' })]);

    const raw = await promptOpenAiCompatible(deepseekOptions(), messages);

    expect(raw).toBe('{"ok":true}');
  });

  it('DeepSeek preset 走 json_object 而不是 json_schema，并关掉 thinking', async () => {
    const { captured } = stubFetch([completion('{}')]);

    await promptOpenAiCompatible(deepseekOptions(), messages, { temperature: 0 });

    const body = captured[0].body;
    expect(body.model).toBe(DEEPSEEK_DEFAULT_MODEL);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.stream).toBe(false);
    // JSON 输出被截断就是无效的，所以 max_tokens 必须显式给足。
    expect(typeof body.max_tokens).toBe('number');
    expect(body.max_tokens as number).toBeGreaterThanOrEqual(4096);
  });

  it('拼出 /chat/completions 端点并带上 Bearer 密钥，末尾斜杠不会拼出双斜杠', async () => {
    const { captured } = stubFetch([completion('{}')]);

    await promptOpenAiCompatible(deepseekOptions({ apiBaseUrl: `${DEEPSEEK_DEFAULT_BASE_URL}/` }), messages);

    expect(captured[0].url).toBe(`${DEEPSEEK_DEFAULT_BASE_URL}/chat/completions`);
    expect(captured[0].headers.Authorization).toBe('Bearer sk-test');
    expect(captured[0].headers['Content-Type']).toBe('application/json');
  });

  it('空内容会重试一次（DeepSeek 官方承认的偶发行为）', async () => {
    const { captured, fetchMock } = stubFetch([completion(''), completion('{"ok":true}')]);

    const raw = await promptOpenAiCompatible(deepseekOptions(), messages);

    expect(raw).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(captured).toHaveLength(2);
  });

  it('连续两次空内容才报错', async () => {
    const { fetchMock } = stubFetch([completion('   '), completion('')]);

    await expect(promptOpenAiCompatible(deepseekOptions(), messages)).rejects.toBeInstanceOf(
      ProviderInvocationError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('HTTP 错误带上状态码与服务端原文', async () => {
    stubFetch([
      new Response('{"error":{"message":"Authentication Fails"}}', {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    ]);

    await expect(promptOpenAiCompatible(deepseekOptions(), messages)).rejects.toThrow(
      /HTTP 401[\s\S]*Authentication Fails/,
    );
  });

  it('缺密钥 / 缺模型 / 缺地址都在发请求前拦下', async () => {
    const { fetchMock } = stubFetch([completion('{}')]);

    await expect(promptOpenAiCompatible(deepseekOptions({ apiKey: '  ' }), messages)).rejects.toBeInstanceOf(
      ProviderConfigurationError,
    );
    await expect(promptOpenAiCompatible(deepseekOptions({ model: '' }), messages)).rejects.toBeInstanceOf(
      ProviderConfigurationError,
    );
    await expect(
      promptOpenAiCompatible(deepseekOptions({ apiBaseUrl: '' }), messages),
    ).rejects.toBeInstanceOf(ProviderConfigurationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('json_schema 模式要求显式提供 schema（给以后接 OpenAI 一类的厂商留的口子）', async () => {
    stubFetch([completion('{}')]);

    await expect(
      promptOpenAiCompatible(deepseekOptions({ responseMode: 'json_schema' }), messages),
    ).rejects.toBeInstanceOf(ProviderConfigurationError);
  });

  it('json_schema 模式下把 schema 放进 strict 约束里', async () => {
    const responseSchema = { type: 'object', properties: { a: { type: 'string' } } };
    const { captured } = stubFetch([completion('{}')]);

    await promptOpenAiCompatible(
      deepseekOptions({ responseMode: 'json_schema' }),
      messages,
      { responseSchema },
    );

    expect(captured[0].body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'structured_output', strict: true, schema: responseSchema },
    });
  });
});
