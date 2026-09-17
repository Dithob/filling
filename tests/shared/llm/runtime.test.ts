import { describe, expect, it } from 'vitest';
import { invokeWithProvider } from '../../../shared/llm/runtime';
import { NoProviderConfiguredError } from '../../../shared/llm/errors';
import type { ChatMessage, ProviderConfig } from '../../../shared/types';

const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];

describe('invokeWithProvider', () => {
  it('rejects an explicit no-AI provider as "not configured"', async () => {
    // 'none' is the default setting, not an error state. Callers already treat
    // NoProviderConfiguredError as "hide the AI affordance / fall back to the
    // local dictionary", so it must be the error thrown here — not a
    // ProviderConfigurationError, which reads as "misconfigured".
    const provider: ProviderConfig = { kind: 'none' };

    await expect(invokeWithProvider(provider, messages)).rejects.toBeInstanceOf(
      NoProviderConfiguredError,
    );
  });

  it('rejects a missing provider the same way', async () => {
    await expect(invokeWithProvider(null, messages)).rejects.toBeInstanceOf(
      NoProviderConfiguredError,
    );
  });
});
