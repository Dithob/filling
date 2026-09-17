import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  createDeepSeekProvider,
  getSettings,
  isAiConfigured,
  saveSettings,
} from '../../../shared/storage/settings';

describe('getSettings', () => {
  it('defaults to no AI on a fresh install', async () => {
    // The whole point of the fork: a new user must be able to fill forms
    // without downloading a model or pasting an API key.
    const settings = await getSettings();

    expect(settings.provider).toEqual({ kind: 'none' });
  });

  it('degrades an unknown stored provider kind to no AI', async () => {
    await fakeBrowser.storage.local.set({
      'settings:app': { provider: { kind: 'legacy-provider' }, adapters: ['zh_cn'] },
    });

    expect((await getSettings()).provider).toEqual({ kind: 'none' });
  });

  it('drops the retired provider kinds instead of resurrecting them', async () => {
    // `on-device` / `openai` / `gemini` 都曾是合法 kind：本地模型不支持中文且要下
    // 几 GB，另外两家与国内校招场景错配。现在只剩 none / deepseek，老值必须落回
    // none —— 宁可让用户重填一次 Key，也不能让陈旧 storage 静默把人带进联网解析。
    for (const kind of ['on-device', 'openai', 'gemini']) {
      await fakeBrowser.storage.local.set({
        'settings:app': { provider: { kind, apiKey: 'sk-legacy', model: 'legacy-model' }, adapters: ['zh_cn'] },
      });

      expect((await getSettings()).provider, kind).toEqual({ kind: 'none' });
    }
  });

  it('round-trips a configured DeepSeek provider through storage', async () => {
    const current = await getSettings();
    // 空字符串的 model 要走默认值，顺便验证 Key 会被 trim。
    await saveSettings({ ...current, provider: createDeepSeekProvider('  sk-test  ', '') });

    expect((await getSettings()).provider).toEqual({
      kind: 'deepseek',
      apiKey: 'sk-test',
      model: 'deepseek-flash',
      apiBaseUrl: 'https://api.deepseek.com',
    });
  });
});

describe('isAiConfigured', () => {
  const base = { kind: 'deepseek' as const, apiBaseUrl: 'https://api.deepseek.com' };

  it('treats the none provider and missing values as not configured', () => {
    expect(isAiConfigured({ kind: 'none' })).toBe(false);
    expect(isAiConfigured(null)).toBe(false);
    expect(isAiConfigured(undefined)).toBe(false);
  });

  it('requires both an API key and a model', () => {
    expect(isAiConfigured({ ...base, apiKey: '   ', model: 'deepseek-flash' })).toBe(false);
    expect(isAiConfigured({ ...base, apiKey: 'sk-1', model: '   ' })).toBe(false);
    expect(isAiConfigured({ ...base, apiKey: 'sk-1', model: 'deepseek-flash' })).toBe(true);
  });
});
