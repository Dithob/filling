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

/** 档案名长度上限：容得下「腾讯-算法岗-2026秋招」这类方案名，又不至于撑破列表。 */
export const PROFILE_NAME_MAX_LENGTH = 40;

/**
 * 正常化用户输入的档案名：去掉首尾空白，把连续空白折成一个空格。
 * 只做正常化，不做合法性判断——校验请走 validateProfileName。
 */
export function normalizeProfileName(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/** 校验档案名，返回已翻译好的错误文案；合法时返回 null。 */
export function validateProfileName(
  value: string | null | undefined,
  t: Translator,
): string | null {
  const normalized = normalizeProfileName(value);
  if (!normalized) {
    return t('onboarding.manage.rename.required');
  }
  if (normalized.length > PROFILE_NAME_MAX_LENGTH) {
    return t('onboarding.manage.rename.tooLong', [PROFILE_NAME_MAX_LENGTH]);
  }
  return null;
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
  const parsedAt = profile.parsedAt ? formatDateTime(profile.parsedAt) : null;
  // 只有 AI 解析会写 provider 快照；规则抽取不写（它不是模型产物），
  // 所以这里判不出 provider 就等于「不是 AI 解析来的」。
  if (profile.provider?.kind === 'deepseek') {
    return parsedAt
      ? t('onboarding.manage.parsedDeepSeekAt', [profile.provider.model, parsedAt])
      : t('onboarding.manage.parsedDeepSeek', [profile.provider.model]);
  }
  return t('onboarding.manage.notParsed');
}
