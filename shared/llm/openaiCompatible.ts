import type { ChatMessage, ProviderKind } from '../types';
import { ProviderConfigurationError, ProviderInvocationError } from './errors';

/**
 * 所有云端厂商共用的调用实现：它们都兼容 OpenAI 的 `/chat/completions` 协议，
 * 差别只在 baseUrl、模型名、以及**支持哪种结构化输出**。
 *
 * 接新厂商的做法：加一个 preset 函数（见文件末尾的 `deepseekProviderOptions`），
 * 不用碰调用逻辑。
 */

/** 该厂商支持的结构化输出形态。 */
export type StructuredOutputMode =
  /** 只保证是合法 JSON，字段名不受约束。DeepSeek 走这条。 */
  | 'json_object'
  /** 用 schema 约束解码，保证字段名与类型。OpenAI 走这条。 */
  | 'json_schema';

export interface OpenAiCompatibleOptions {
  kind: ProviderKind;
  apiKey: string;
  model: string;
  apiBaseUrl: string;
  responseMode: StructuredOutputMode;
  /** 额外请求体字段，如 DeepSeek 的 `thinking: { type: 'disabled' }` */
  extraBody?: Record<string, unknown>;
}

export interface CompatibleInvocationOptions {
  /** 仅 `json_schema` 模式使用；`json_object` 模式不传（厂商会拒）。 */
  responseSchema?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
      /**
       * DeepSeek 在 thinking 模式下把思维链放这里。它是**推理过程不是答案**，
       * 永远不要拿它去 `JSON.parse`。
       */
      reasoning_content?: string;
    };
  }>;
}

/**
 * 一份简历的 JSON 可能包含多段项目/实习经历，给足上限防截断——
 * 官方文档明确要求「reasonably set max_tokens to prevent the JSON string
 * from being truncated midway」，截断的 JSON 是无效的。
 */
const DEFAULT_MAX_TOKENS = 8192;

/** DeepSeek 官方承认 JSON 输出偶发返回空内容，所以空内容要重试。 */
const EMPTY_CONTENT_ATTEMPTS = 2;

export async function promptOpenAiCompatible(
  options: OpenAiCompatibleOptions,
  messages: ChatMessage[],
  invocation: CompatibleInvocationOptions = {},
): Promise<string> {
  const { kind, apiKey, model, apiBaseUrl, responseMode } = options;

  if (!apiKey?.trim()) {
    throw new ProviderConfigurationError(kind, `${kind} API key is missing.`);
  }
  if (!model?.trim()) {
    throw new ProviderConfigurationError(kind, `${kind} model is missing.`);
  }
  if (!apiBaseUrl?.trim()) {
    throw new ProviderConfigurationError(kind, `${kind} API base URL is missing.`);
  }
  if (responseMode === 'json_schema' && !invocation.responseSchema) {
    throw new ProviderConfigurationError(
      kind,
      `${kind} is configured for json_schema output but no response schema was provided.`,
    );
  }

  const endpoint = `${stripTrailingSlash(apiBaseUrl)}/chat/completions`;
  const body = buildRequestBody(options, messages, invocation);

  // 只重试「空内容」这一种传输层瑕疵。JSON 解析失败 / 校验失败属于语义问题，
  // 由调用方的「回喂修复」处理，在这里盲目重发只会白烧 token。
  for (let attempt = 1; attempt <= EMPTY_CONTENT_ATTEMPTS; attempt += 1) {
    const content = await postChatCompletion(kind, endpoint, apiKey, body, invocation.signal);
    if (content.trim().length > 0) {
      return content;
    }
  }

  throw new ProviderInvocationError(
    kind,
    `${kind} 连续 ${EMPTY_CONTENT_ATTEMPTS} 次返回空内容。可以重试，或改用规则解析。`,
  );
}

function buildRequestBody(
  options: OpenAiCompatibleOptions,
  messages: ChatMessage[],
  invocation: CompatibleInvocationOptions,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages,
    temperature: invocation.temperature ?? 0,
    max_tokens: invocation.maxTokens ?? DEFAULT_MAX_TOKENS,
    stream: false,
    ...(options.extraBody ?? {}),
  };

  // response_format 放在 extraBody 之后，避免被 preset 的额外字段覆盖掉。
  if (options.responseMode === 'json_object') {
    body.response_format = { type: 'json_object' };
  } else if (invocation.responseSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'structured_output',
        strict: true,
        schema: invocation.responseSchema,
      },
    };
  }

  return body;
}

async function postChatCompletion(
  kind: ProviderKind,
  endpoint: string,
  apiKey: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    // 扩展里网络层失败最常见的原因是 manifest 的 host_permissions 没覆盖该域名。
    const reason = error instanceof Error ? error.message : String(error);
    throw new ProviderInvocationError(
      kind,
      `无法连接 ${endpoint}：${reason}。请确认扩展的 host_permissions 覆盖了该域名，并且网络可达。`,
    );
  }

  if (!response.ok) {
    throw new ProviderInvocationError(
      kind,
      `${kind} 请求失败（HTTP ${response.status}）：${await readErrorBody(response)}`,
    );
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return data.choices?.[0]?.message?.content ?? '';
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim();
    if (!text) {
      return '服务器未返回错误详情。';
    }
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  } catch {
    return '无法读取错误详情。';
  }
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com';

/**
 * 当前模型名。官方定价页写明「Use `deepseek-flash` as the model name」，
 * 对应 DeepSeek-V4.1-Flash。`deepseek-v4-flash` / `deepseek-chat` /
 * `deepseek-reasoner` 都是已退役或已弃用的兼容名，不要写进默认值。
 */
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-flash';

/**
 * DeepSeek 专用 preset。
 *
 * 两个必须记住的官方约束：
 *
 * 1. **`response_format` 只支持 `json_object`，不支持 `json_schema`。** 所以
 *    「让模型吐出规则能完美适配的 JSON」拿不到服务端强约束，只能靠
 *    「提示词里的形状示例 + 落库前的 AJV 校验 + 校验失败回喂修复」三段式。
 * 2. **thinking 模式默认开启。** 结构化抽取不需要思维链，关掉更快更省，
 *    也避免误把 `reasoning_content` 当结果。
 */
export function deepseekProviderOptions(
  apiKey: string,
  model: string = DEEPSEEK_DEFAULT_MODEL,
  apiBaseUrl: string = DEEPSEEK_DEFAULT_BASE_URL,
): OpenAiCompatibleOptions {
  return {
    kind: 'deepseek',
    apiKey,
    model,
    apiBaseUrl,
    responseMode: 'json_object',
    extraBody: { thinking: { type: 'disabled' } },
  };
}
