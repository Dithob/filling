import type { AppSettings, DeepSeekProviderConfig, ProviderConfig } from '../types';
import { getAllAdapterIds } from '../apply/slots';
import { DEEPSEEK_DEFAULT_BASE_URL, DEEPSEEK_DEFAULT_MODEL } from '../llm/openaiCompatible';

const SETTINGS_KEY = 'settings:app';

const DEFAULT_SETTINGS: AppSettings = {
  // AI 默认关闭，而且它只服务于「导入简历时的 AI 解析」这一件事。
  // 字段匹配与填表是纯本地的（字段字典），装完就能用，不联网、不需要密钥。
  provider: {
    kind: 'none',
  },
  adapters: getAllAdapterIds(),
  autoFallback: 'skip',
  highlightOverlay: true,
  fillMode: 'emptyOnly',
};

export async function getSettings(): Promise<AppSettings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY] as AppSettings | undefined;
  if (!settings) {
    return DEFAULT_SETTINGS;
  }
  const adapters =
    Array.isArray(settings.adapters) && settings.adapters.length > 0
      ? settings.adapters
      : getAllAdapterIds();
  const autoFallback: AppSettings['autoFallback'] = settings.autoFallback === 'pause' ? 'pause' : 'skip';
  const highlightOverlay = settings.highlightOverlay === false ? false : true;
  return {
    provider: normalizeProvider(settings.provider),
    adapters,
    autoFallback,
    highlightOverlay,
    fillMode: normalizeFillMode(settings.fillMode),
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const adapters =
    settings.adapters && settings.adapters.length > 0 ? settings.adapters : getAllAdapterIds();
  const normalized: AppSettings = {
    provider: normalizeProvider(settings.provider),
    adapters,
    autoFallback: settings.autoFallback === 'pause' ? 'pause' : 'skip',
    highlightOverlay: settings.highlightOverlay === false ? false : true,
    fillMode: normalizeFillMode(settings.fillMode),
  };
  await browser.storage.local.set({ [SETTINGS_KEY]: normalized });
}

/** 老数据没有这个字段，一律按「只填空」处理。 */
function normalizeFillMode(value: unknown): AppSettings['fillMode'] {
  return value === 'overwrite' ? 'overwrite' : 'emptyOnly';
}

export function createDeepSeekProvider(
  apiKey: string,
  model: string = DEEPSEEK_DEFAULT_MODEL,
  apiBaseUrl: string = DEEPSEEK_DEFAULT_BASE_URL,
): DeepSeekProviderConfig {
  return normalizeDeepSeekProvider({ kind: 'deepseek', apiKey, model, apiBaseUrl });
}

/**
 * 「AI 解析」是否可用：必须配好 Key 与模型。
 *
 * 这是唯一的 AI 可用性判断。填表链路不看它——那边永远不碰模型。
 */
export function isAiConfigured(provider: ProviderConfig | null | undefined): boolean {
  if (!provider || provider.kind !== 'deepseek') {
    return false;
  }
  return provider.apiKey.trim().length > 0 && provider.model.trim().length > 0;
}

function normalizeDeepSeekProvider(provider: DeepSeekProviderConfig): DeepSeekProviderConfig {
  return {
    kind: 'deepseek',
    apiKey: provider.apiKey?.trim() ?? '',
    model: provider.model?.trim().length ? provider.model.trim() : DEEPSEEK_DEFAULT_MODEL,
    apiBaseUrl: provider.apiBaseUrl?.trim().length
      ? provider.apiBaseUrl.trim()
      : DEEPSEEK_DEFAULT_BASE_URL,
  };
}

/**
 * 收敛 provider。
 *
 * 历史版本存在 `on-device` / `openai` / `gemini` 三种 kind：本地模型能力差
 * （不支持中文）且要下几 GB，OpenAI / Gemini 与国内校招场景错配。现在只保留
 * `none` 与 `deepseek`，**任何未知 kind 一律落回 `none`**——宁可让用户重新填一次
 * Key，也不能让一个陈旧的 storage 值静默地把用户带进联网解析。
 */
function normalizeProvider(provider: ProviderConfig): ProviderConfig {
  if (provider.kind === 'deepseek') {
    return normalizeDeepSeekProvider(provider);
  }
  return { kind: 'none' };
}
