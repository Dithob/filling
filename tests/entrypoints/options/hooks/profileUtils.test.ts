import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  formatProfileParsing,
  formatProfileSummary,
  resolveProfileName,
} from '../../../../entrypoints/options/hooks/profileUtils';
import type { ProfileRecord } from '../../../../shared/types';
import { createEmptyProfile } from '../../../../shared/schema/cnProfile';

const t = (key: string, args?: unknown) =>
  Array.isArray(args) ? `${key}:${args.join(',')}` : key;

const baseProfile: ProfileRecord = {
  ...createEmptyProfile('profile-1', ''),
  createdAt: '2024-01-01T00:00:00.000Z',
  rawText: 'hello',
  sourceFile: undefined,
};

describe('profile formatting helpers', () => {
  it('falls back to unnamed when both scheme and person name are missing', () => {
    expect(resolveProfileName(baseProfile, t)).toBe('onboarding.manage.unnamed');
  });

  it('prefers the scheme name over the person name', () => {
    const profile: ProfileRecord = {
      ...baseProfile,
      name: '算法岗',
      basic: { name: '张三', phone: '', email: '' },
    };
    expect(resolveProfileName(profile, t)).toBe('算法岗');
  });

  it('uses the person name when no scheme name is set', () => {
    const profile: ProfileRecord = {
      ...baseProfile,
      basic: { name: '张三', phone: '', email: '' },
    };
    expect(resolveProfileName(profile, t)).toBe('张三');
  });

  it('describes uploaded files in the summary', () => {
    const profile: ProfileRecord = {
      ...baseProfile,
      sourceFile: {
        name: 'resume.pdf',
        size: 1234,
        type: 'application/pdf',
        storageKey: 'profile-1/resume.pdf',
      },
    };
    expect(formatProfileSummary(profile, t)).toContain('resume.pdf');
  });

  it('renders provider metadata for OpenAI profiles', () => {
    const profile: ProfileRecord = {
      ...baseProfile,
      provider: { kind: 'openai', model: 'gpt-mini', apiBaseUrl: '' },
      parsedAt: '2024-02-01T00:00:00.000Z',
    };
    const parsing = formatProfileParsing(profile, t);
    expect(parsing).toContain('onboarding.manage.parsedOpenAIAt');
  });

  it('handles missing provider details', () => {
    expect(formatProfileParsing(baseProfile, t)).toBe('onboarding.manage.notParsed');
  });

  it('formats dates and keeps invalid input unchanged', () => {
    expect(formatDateTime('2024-01-01T00:00:00.000Z')).toContain('2024');
    expect(formatDateTime('invalid-date')).toBe('invalid-date');
  });
});
