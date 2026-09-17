import type { FieldSlot } from './slotTypes';
import { STRUCTURED_FIELD_SLOTS, isReservedCustomKey } from '../schema/reservedCustomKeys';

export function formatSlotLabel(slot: FieldSlot): string {
  switch (slot) {
    case 'firstName':
      return i18n.t('slots.firstName');
    case 'lastName':
      return i18n.t('slots.lastName');
    case 'email':
      return i18n.t('slots.email');
    case 'phone':
      return i18n.t('slots.phone');
    case 'address':
      return i18n.t('slots.address');
    case 'website':
      return i18n.t('slots.website');
    case 'linkedin':
      return i18n.t('slots.linkedin');
    case 'github':
      return i18n.t('slots.github');
    case 'city':
      return i18n.t('slots.city');
    case 'country':
      return i18n.t('slots.country');
    case 'state':
      return i18n.t('slots.state');
    case 'postalCode':
      return i18n.t('slots.postalCode');
    case 'birthDate':
      return i18n.t('slots.birthDate');
    case 'gender':
      return i18n.t('slots.gender');
    case 'currentCompany':
      return i18n.t('slots.currentCompany');
    case 'currentTitle':
      return i18n.t('slots.currentTitle');
    case 'currentLocation':
      return i18n.t('slots.currentLocation');
    case 'currentStartDate':
      return i18n.t('slots.currentStartDate');
    case 'currentEndDate':
      return i18n.t('slots.currentEndDate');
    case 'educationSchool':
      return i18n.t('slots.educationSchool');
    case 'educationDegree':
      return i18n.t('slots.educationDegree');
    case 'educationField':
      return i18n.t('slots.educationField');
    case 'educationStartDate':
      return i18n.t('slots.educationStartDate');
    case 'educationEndDate':
      return i18n.t('slots.educationEndDate');
    case 'educationGpa':
      return i18n.t('slots.educationGpa');
    case 'expectedSalary':
      return i18n.t('slots.expectedSalary');
    case 'preferredLocation':
      return i18n.t('slots.preferredLocation');
    case 'availabilityDate':
      return i18n.t('slots.availabilityDate');
    case 'jobType':
      return i18n.t('slots.jobType');
    case 'skills':
      return i18n.t('slots.skills');
    case 'summary':
      return i18n.t('slots.summary');
    case 'headline':
      return i18n.t('slots.headline');
    case 'nation':
      return i18n.t('slots.nation');
    case 'politicalStatus':
      return i18n.t('slots.politicalStatus');
    case 'idCard':
      return i18n.t('slots.idCard');
    case 'hometown':
      return i18n.t('slots.hometown');
    case 'wechat':
      return i18n.t('slots.wechat');
    case 'qq':
      return i18n.t('slots.qq');
    case 'emergencyContact':
      return i18n.t('slots.emergencyContact');
    case 'emergencyPhone':
      return i18n.t('slots.emergencyPhone');
    case 'englishLevel':
      return i18n.t('slots.englishLevel');
    case 'educationRanking':
      return i18n.t('slots.educationRanking');
    case 'educationFullTime':
      return i18n.t('slots.educationFullTime');
    case 'internshipDuration':
      return i18n.t('slots.internshipDuration');
    case 'internshipExp':
      return i18n.t('slots.internshipExp');
    case 'projectExp':
      return i18n.t('slots.projectExp');
    case 'campusExp':
      return i18n.t('slots.campusExp');
    case 'awards':
      return i18n.t('slots.awards');
    case 'researchDirection':
      return i18n.t('slots.researchDirection');
    case 'hobbies':
      return i18n.t('slots.hobbies');
    case 'name':
    default:
      return i18n.t('slots.name');
  }
}

/**
 * `meta.custom` 里的保留键在设置页里的展示名；非保留键返回 undefined
 * （调用方应把它当用户自己写的问答，原样显示键名）。
 *
 * 不认识的槽位一律返回 undefined，**不要**回落到 `formatSlotLabel`：
 * 它的 `default` 分支会给出「姓名」，把作品集之类的字段标成姓名比不标更糟。
 */
export function formatCustomFieldLabel(key: string): string | undefined {
  if (!isReservedCustomKey(key)) {
    return undefined;
  }
  // 作品集在填表时映射到 website 槽位（apply/profile.ts），展示名要单独给一条，
  // 不能借 website 的「个人网站」。
  if (key.trim() === 'portfolio') {
    return i18n.t('slots.portfolio');
  }
  const slot = STRUCTURED_FIELD_SLOTS[key.trim()];
  return slot ? formatSlotLabel(slot) : undefined;
}
