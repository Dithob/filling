import type { AppSettings, GeminiProviderConfig, OpenAIProviderConfig, ProviderConfig } from '../types';
import { getAllAdapterIds } from '../apply/slots';

const SETTINGS_KEY = 'settings:app';
export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com';
export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';

const DEFAULT_SETTINGS: AppSettings = {
  // AI is opt-in. Field matching and filling are fully local (see the field
  // dictionary), so a fresh install must not push the user into downloading
  // Gemini Nano before they can do anything.
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
  const adapters = Array.isArray(settings.adapters) && settings.adapters.length > 0 ? settings.adapters : getAllAdapterIds();
  const autoFallback: AppSettings['autoFallback'] = settings.autoFallback === 'pause' ? 'pause' : 'skip';
  const highlightOverlay = settings.highlightOverlay === false ? false : true;
  const fillMode = normalizeFillMode(settings.fillMode);
  if (settings.provider.kind === 'openai') {
    return {
      provider: normalizeOpenAIProvider(settings.provider),
      adapters,
      autoFallback,
      highlightOverlay,
      fillMode,
    };
  }
  if (settings.provider.kind === 'gemini') {
    return {
      provider: normalizeGeminiProvider(settings.provider),
      adapters,
      autoFallback,
      highlightOverlay,
      fillMode,
    };
  }
  return {
    provider: normalizeProvider(settings.provider),
    adapters,
    autoFallback,
    highlightOverlay,
    fillMode,
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const adapters = settings.adapters && settings.adapters.length > 0 ? settings.adapters : getAllAdapterIds();
  const highlightOverlay = settings.highlightOverlay === false ? false : true;
  const normalized: AppSettings = {
    provider: normalizeProvider(settings.provider),
    adapters,
    autoFallback: settings.autoFallback === 'pause' ? 'pause' : 'skip',
    highlightOverlay,
    fillMode: normalizeFillMode(settings.fillMode),
  };
  await browser.storage.local.set({ [SETTINGS_KEY]: normalized });
}

/** 老数据没有这个字段，一律按「只填空」处理。 */
function normalizeFillMode(value: unknown): AppSettings['fillMode'] {
  return value === 'overwrite' ? 'overwrite' : 'emptyOnly';
}

export function createOnDeviceProvider(): ProviderConfig {
  return { kind: 'on-device' };
}

/**
 * Whether the user has opted into AI *and* given it something usable.
 *
 * Checks that only need to know "is AI on?" (e.g. whether to show the
 * classify-these-fields button) should gate on this. Chrome's on-device model
 * cannot be probed synchronously, so it counts as enabled here; if the model
 * is missing at call time, invokeWithProvider reports it and the caller falls
 * back to the local dictionary.
 */
export function isAiEnabled(provider: ProviderConfig | null | undefined): boolean {
  if (!provider) {
    return false;
  }
  switch (provider.kind) {
    case 'none':
      return false;
    case 'on-device':
      return true;
    case 'openai':
    case 'gemini':
      return provider.apiKey.trim().length > 0 && provider.model.trim().length > 0;
  }
}

export function createOpenAIProvider(
  apiKey: string,
  model: string,
  apiBaseUrl: string = OPENAI_DEFAULT_BASE_URL,
): ProviderConfig {
  return normalizeOpenAIProvider({ kind: 'openai', apiKey, model, apiBaseUrl });
}

export function createGeminiProvider(apiKey: string, model: string = GEMINI_DEFAULT_MODEL): ProviderConfig {
  return normalizeGeminiProvider({ kind: 'gemini', apiKey, model });
}

function normalizeOpenAIProvider(provider: OpenAIProviderConfig): OpenAIProviderConfig {
  return {
    ...provider,
    apiBaseUrl: provider.apiBaseUrl?.trim().length ? provider.apiBaseUrl : OPENAI_DEFAULT_BASE_URL,
  };
}

function normalizeGeminiProvider(provider: GeminiProviderConfig): GeminiProviderConfig {
  return {
    kind: 'gemini',
    apiKey: provider.apiKey?.trim() ?? '',
    model: provider.model?.trim() ?? '',
  };
}

function normalizeProvider(provider: ProviderConfig): ProviderConfig {
  if (provider.kind === 'openai') {
    return normalizeOpenAIProvider(provider);
  }
  if (provider.kind === 'gemini') {
    return normalizeGeminiProvider(provider);
  }
  // 'none' and 'on-device' carry no extra fields; unknown kinds fall back to
  // 'none' so a stale/手工改坏的 storage value can never opt a user into AI.
  if (provider.kind === 'on-device') {
    return provider;
  }
  return { kind: 'none' };
}
