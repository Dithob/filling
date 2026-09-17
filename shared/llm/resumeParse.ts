import type { CnProfileData } from '../schema/cnProfile';
import { normalizeCnProfileData } from '../schema/cnProfile';
import type { ProviderConfig } from '../types';
import { validateCnProfile } from '../validate';
import { invokeWithProvider } from './runtime';
import {
  buildResumeParseMessages,
  buildResumeRepairMessages,
} from './resumeParsePrompt';

/**
 * 「AI 解析简历」的编排：一次解析 → 本地校验 → 不合格就回喂报错修复一次。
 *
 * 之所以要有修复这一轮，是因为 DeepSeek 的 `response_format` 只支持
 * `json_object`——它保证「是合法 JSON」，但**不保证字段名对**。没有服务端
 * 强约束，就只能自己兜：用 JSON Schema 校验，错了把错误原文喂回去让模型改。
 */

export class ResumeParseError extends Error {
  readonly validationErrors: string[];

  constructor(message: string, validationErrors: string[] = []) {
    super(message);
    this.name = 'ResumeParseError';
    this.validationErrors = validationErrors;
  }
}

export interface ResumeParseOutcome {
  data: CnProfileData;
  /** 修复过一轮才通过校验。UI 可以据此提示「已自动修正」。 */
  repaired: boolean;
}

const MAX_VALIDATION_ERRORS_IN_MESSAGE = 8;

export async function parseResumeWithAi(
  provider: ProviderConfig,
  rawText: string,
  signal?: AbortSignal,
): Promise<ResumeParseOutcome> {
  const first = await invokeWithProvider(provider, buildResumeParseMessages(rawText), {
    temperature: 0,
    signal,
  });

  const firstAttempt = assess(first);
  if (firstAttempt.ok) {
    return { data: toProfileData(firstAttempt.value), repaired: false };
  }

  // 只修复一轮。再失败就交还给用户——继续重试既烧 token 又未必收敛，
  // 而用户此时已经有「规则解析」这条随时可用的退路。
  const repaired = await invokeWithProvider(
    provider,
    buildResumeRepairMessages(rawText, first, firstAttempt.errors),
    { temperature: 0, signal },
  );

  const secondAttempt = assess(repaired);
  if (secondAttempt.ok) {
    return { data: toProfileData(secondAttempt.value), repaired: true };
  }

  throw new ResumeParseError(
    'AI 输出的内容两次都不符合档案结构，已放弃。可以重试，或改用规则解析。',
    secondAttempt.errors,
  );
}

type Assessment =
  | { ok: true; value: unknown }
  | { ok: false; errors: string[] };

function assess(raw: string): Assessment {
  const parsed = tryParseJsonObject(raw);
  if (!parsed) {
    return { ok: false, errors: ['输出不是一个合法的 JSON 对象。'] };
  }
  const validation = validateCnProfile(parsed);
  if (!validation.valid) {
    const errors = validation.errors ?? [];
    return {
      ok: false,
      errors:
        errors.length > MAX_VALIDATION_ERRORS_IN_MESSAGE
          ? errors.slice(0, MAX_VALIDATION_ERRORS_IN_MESSAGE)
          : errors,
    };
  }
  return { ok: true, value: parsed };
}

function toProfileData(value: unknown): CnProfileData {
  const data = normalizeCnProfileData(value);
  // attachments.resumeId 指向本地简历库条目，只能由程序写入。
  // 即便提示词说了别输出，也不能信模型——一个编出来的 id 会让附件上传指向不存在的文件。
  delete data.attachments.resumeId;
  return data;
}

/**
 * 宽松解析：优先整体 parse；失败时退一步取第一个 `{` 到最后一个 `}`。
 * 模型偶尔仍会包一层代码块或加一句前缀，这里兜住，省掉一次白跑的修复往返。
 */
function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }

  const direct = parseObject(text);
  if (direct) {
    return direct;
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return parseObject(text.slice(start, end + 1));
  }
  return null;
}

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
