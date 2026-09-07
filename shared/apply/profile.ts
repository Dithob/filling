import type { CnProfile } from '../schema/cnProfile';
import type { ProfileRecord } from '../types';
import type { FieldSlot } from './slotTypes';
import { coerceString, normalizeDate } from './value';

export type SlotValueMap = Partial<Record<FieldSlot, string>>;

type SlotResolver = (profile: CnProfile) => string | undefined;

interface SlotDefinition {
  slot: FieldSlot;
  resolver: SlotResolver;
}

/**
 * 姓名拆分：英文按空格拆 given / family；中文首字为姓（优先识别常见复姓）。
 */
function splitName(fullName: string): { lastName?: string; firstName?: string } {
  const name = fullName.trim();
  if (!name) {
    return {};
  }
  if (/[a-zA-Z]/.test(name) && !/[\u4e00-\u9fa5]/.test(name)) {
    const parts = name.split(/\s+/);
    return { firstName: parts[0], lastName: parts.length > 1 ? parts[parts.length - 1] : undefined };
  }
  const compoundSurnames = [
    '欧阳', '上官', '司马', '诸葛', '东方', '夏侯', '皇甫',
    '尉迟', '公孙', '慕容', '长孙', '宇文', '司徒', '轩辕',
  ];
  const compound = compoundSurnames.find((surname) => name.startsWith(surname));
  if (compound) {
    return { lastName: compound, firstName: name.slice(compound.length) || undefined };
  }
  return { lastName: name.slice(0, 1), firstName: name.slice(1) || undefined };
}

const SLOT_DEFINITIONS: SlotDefinition[] = [
  { slot: 'name', resolver: (p) => read(p.basic?.name) },
  { slot: 'firstName', resolver: (p) => splitName(p.basic?.name ?? '').firstName },
  { slot: 'lastName', resolver: (p) => splitName(p.basic?.name ?? '').lastName },
  { slot: 'email', resolver: (p) => read(p.basic?.email) },
  { slot: 'phone', resolver: (p) => read(p.basic?.phone) },
  { slot: 'gender', resolver: (p) => read(p.basic?.gender) },
  { slot: 'birthDate', resolver: (p) => normalizeDate(p.basic?.birthDate) },
  { slot: 'city', resolver: (p) => read(p.basic?.city) },
  { slot: 'address', resolver: (p) => read(p.basic?.address) },
  { slot: 'website', resolver: (p) => read(p.links?.blog) ?? read(p.links?.portfolio) },
  { slot: 'linkedin', resolver: (p) => read(p.links?.linkedin) },
  { slot: 'github', resolver: (p) => read(p.links?.github) },
  { slot: 'summary', resolver: (p) => read(p.texts?.selfIntro) },
  { slot: 'headline', resolver: (p) => read(p.intention?.position) },

  { slot: 'educationSchool', resolver: (p) => read(p.education?.school) },
  { slot: 'educationDegree', resolver: (p) => read(p.education?.degree) },
  { slot: 'educationField', resolver: (p) => read(p.education?.major) },
  { slot: 'educationStartDate', resolver: (p) => normalizeDate(p.education?.enrollmentDate) },
  { slot: 'educationEndDate', resolver: (p) => normalizeDate(p.education?.graduationDate) },
  { slot: 'educationGpa', resolver: (p) => read(p.education?.gpa) ?? read(p.education?.ranking) },

  { slot: 'expectedSalary', resolver: (p) => read(p.intention?.expectedSalary) },
  { slot: 'preferredLocation', resolver: (p) => read(p.intention?.expectedCity) },
  { slot: 'availabilityDate', resolver: (p) => normalizeDate(p.intention?.availability) },
  { slot: 'jobType', resolver: (p) => read(p.intention?.jobType) },
  { slot: 'skills', resolver: (p) => read(p.texts?.skills) },
];

export function buildSlotValues(profile: ProfileRecord | CnProfile | null | undefined): SlotValueMap {
  if (!profile) {
    return {};
  }

  const slots: SlotValueMap = {};
  for (const definition of SLOT_DEFINITIONS) {
    if (slots[definition.slot]) {
      continue;
    }
    const value = definition.resolver(profile);
    if (value) {
      slots[definition.slot] = value;
    }
  }
  return slots;
}

/**
 * custom 的「问题 -> 答案」兜底表。表单字段没匹配到任何 slot 时，
 * 用页面标签直接查这张表（见 shared/apply/manualValues.ts）。
 */
export function buildCustomAnswers(
  profile: ProfileRecord | CnProfile | null | undefined,
): Record<string, string> {
  if (!profile?.custom) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(profile.custom)) {
    if (typeof value === 'string' && value.trim()) {
      result[key.trim()] = value.trim();
    }
  }
  return result;
}

function read(value: unknown): string | undefined {
  return coerceString(value);
}
