import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { getSettings, isAiEnabled, saveSettings } from '../../../shared/storage/settings';

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

    const settings = await getSettings();

    expect(settings.provider).toEqual({ kind: 'none' });
  });

  it('keeps an existing on-device choice rather than resetting it', async () => {
    await fakeBrowser.storage.local.set({
      'settings:app': { provider: { kind: 'on-device' }, adapters: ['zh_cn'] },
    });

    const settings = await getSettings();

    expect(settings.provider).toEqual({ kind: 'on-device' });
  });

  it('round-trips the no-AI provider through storage', async () => {
    const current = await getSettings();
    await saveSettings({ ...current, provider: { kind: 'none' } });

    expect((await getSettings()).provider).toEqual({ kind: 'none' });
  });
});

describe('isAiEnabled', () => {
  it('treats no-AI and missing providers as disabled', () => {
    expect(isAiEnabled({ kind: 'none' })).toBe(false);
    expect(isAiEnabled(null)).toBe(false);
    expect(isAiEnabled(undefined)).toBe(false);
  });

  it('treats the on-device model as enabled without probing it', () => {
    expect(isAiEnabled({ kind: 'on-device' })).toBe(true);
  });

  it('requires credentials for the hosted providers', () => {
    expect(isAiEnabled({ kind: 'openai', apiKey: '', model: 'gpt-4o-mini', apiBaseUrl: '' })).toBe(
      false,
    );
    expect(isAiEnabled({ kind: 'gemini', apiKey: 'key', model: '   ' })).toBe(false);
    expect(isAiEnabled({ kind: 'gemini', apiKey: 'key', model: 'gemini-2.5-flash' })).toBe(true);
  });
});
