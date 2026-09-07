import type { ProfileRecord } from '../../../shared/types';

export type Translator = (key: string, substitutions?: unknown) => string;

export function formatDateTime(value: string | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

/**
 * 优先显示方案名（如「算法岗」），其次才是本人姓名。
 */
export function resolveProfileName(profile: ProfileRecord, t: Translator): string {
  const schemeName = profile.name?.trim();
  if (schemeName) {
    return schemeName;
  }
  const personName = profile.basic?.name?.trim();
  if (personName) {
    return personName;
  }
  return t('onboarding.manage.unnamed');
}

export function formatProfileSummary(profile: ProfileRecord, t: Translator): string {
  const created = formatDateTime(profile.createdAt);
  const characters = (profile.rawText?.length ?? 0).toLocaleString();
  if (profile.sourceFile?.name) {
    return t('onboarding.manage.summaryWithFile', [created, profile.sourceFile.name, characters]);
  }
  return t('onboarding.manage.summary', [created, characters]);
}

export function formatProfileParsing(profile: ProfileRecord, t: Translator): string {
  if (!profile.provider) {
    return t('onboarding.manage.notParsed');
  }
  const parsedAt = profile.parsedAt ? formatDateTime(profile.parsedAt) : null;
  if (profile.provider.kind === 'openai') {
    return parsedAt
      ? t('onboarding.manage.parsedOpenAIAt', [profile.provider.model, parsedAt])
      : t('onboarding.manage.parsedOpenAI', [profile.provider.model]);
  }
  if (profile.provider.kind === 'gemini') {
    return parsedAt
      ? t('onboarding.manage.parsedGeminiAt', [profile.provider.model, parsedAt])
      : t('onboarding.manage.parsedGemini', [profile.provider.model]);
  }
  return parsedAt
    ? t('onboarding.manage.parsedOnDeviceAt', [parsedAt])
    : t('onboarding.manage.parsedOnDevice');
}
