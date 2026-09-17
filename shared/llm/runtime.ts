import type { ChatMessage, ProviderConfig } from '../types';
import {
  deepseekProviderOptions,
  promptOpenAiCompatible,
  type CompatibleInvocationOptions,
} from './openaiCompatible';
import { NoProviderConfiguredError, ProviderConfigurationError } from './errors';

export type LlmInvocationOptions = CompatibleInvocationOptions;

/**
 * 唯一的模型调用出口。
 *
 * 目前只有一条路：DeepSeek 简历解析。填表链路完全不经过这里——字段匹配与填值
 * 由本地字段字典确定性完成。
 */
export async function invokeWithProvider(
  provider: ProviderConfig | null | undefined,
  messages: ChatMessage[],
  options: LlmInvocationOptions = {},
): Promise<string> {
  if (!provider) {
    throw new NoProviderConfiguredError();
  }

  switch (provider.kind) {
    // `none` 是默认档：用户没打算用 AI。调用方把 NoProviderConfiguredError
    // 当作「没配 Key」处理，引导去填 Key，而不是报错。
    case 'none':
      throw new NoProviderConfiguredError();
    case 'deepseek':
      return promptOpenAiCompatible(
        deepseekProviderOptions(provider.apiKey, provider.model, provider.apiBaseUrl),
        messages,
        options,
      );
    default: {
      // 类型收敛后这里不可达；留着是为了让「以后加 provider 忘了改分发」变成编译错误。
      const exhaustive: never = provider;
      throw new ProviderConfigurationError(
        'deepseek',
        `Unsupported provider kind: ${String(exhaustive)}`,
      );
    }
  }
}
