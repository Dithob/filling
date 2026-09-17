import { describe, expect, it } from 'vitest';
import {
  PROFILE_NAME_MAX_LENGTH,
  formatDateTime,
  formatProfileParsing,
  formatProfileSummary,
  normalizeProfileName,
  resolveProfileName,
  validateProfileName,
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

  it('renders the model name for AI-parsed profiles', () => {
    const profile: ProfileRecord = {
      ...baseProfile,
      provider: {
        kind: 'deepseek',
        model: 'deepseek-flash',
        apiBaseUrl: 'https://api.deepseek.com',
      },
      parsedAt: '2024-02-01T00:00:00.000Z',
    };
    const parsing = formatProfileParsing(profile, t);
    expect(parsing).toContain('onboarding.manage.parsedDeepSeekAt');
    expect(parsing).toContain('deepseek-flash');
  });

  it('handles missing provider details', () => {
    expect(formatProfileParsing(baseProfile, t)).toBe('onboarding.manage.notParsed');
  });

  it('formats dates and keeps invalid input unchanged', () => {
    expect(formatDateTime('2024-01-01T00:00:00.000Z')).toContain('2024');
    expect(formatDateTime('invalid-date')).toBe('invalid-date');
  });
});

describe('profile renaming helpers', () => {
  it('trims the name and collapses inner whitespace', () => {
    expect(normalizeProfileName('  算法岗  ')).toBe('算法岗');
    expect(normalizeProfileName('腾讯  后端\n岗')).toBe('腾讯 后端 岗');
  });

  it('treats nullish input as an empty name', () => {
    expect(normalizeProfileName(undefined)).toBe('');
    expect(normalizeProfileName(null)).toBe('');
  });

  it('rejects blank names', () => {
    expect(validateProfileName('', t)).toBe('onboarding.manage.rename.required');
    expect(validateProfileName('   ', t)).toBe('onboarding.manage.rename.required');
  });

  it('accepts a normal name', () => {
    expect(validateProfileName('算法岗', t)).toBeNull();
  });

  it('accepts a name exactly at the length limit', () => {
    expect(validateProfileName('a'.repeat(PROFILE_NAME_MAX_LENGTH), t)).toBeNull();
  });

  it('rejects a name past the limit and reports the limit in the message', () => {
    const message = validateProfileName('a'.repeat(PROFILE_NAME_MAX_LENGTH + 1), t);
    expect(message).toBe(`onboarding.manage.rename.tooLong:${PROFILE_NAME_MAX_LENGTH}`);
  });

  it('measures the normalised name rather than the raw input', () => {
    const padded = `  ${'a'.repeat(PROFILE_NAME_MAX_LENGTH)}  `;
    expect(padded.length).toBeGreaterThan(PROFILE_NAME_MAX_LENGTH);
    expect(validateProfileName(padded, t)).toBeNull();
  });
});
