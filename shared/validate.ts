import type { ErrorObject } from 'ajv';
import * as compiledResumeValidate from '@/shared/schema/jsonresume-v1.validate.cjs';
import * as compiledCnProfileValidate from '@/shared/schema/cnProfile-v1.validate.cjs';

type Validator = ((data: unknown) => boolean) & {
  errors?: ErrorObject[] | null;
};

/**
 * ajv-cli 的 CJS 产物有 `module.exports = validate` 与 `exports.default = validate`
 * 两种导出形态（取决于打包方式），两种都要认。
 */
function resolveValidator(compiledModule: unknown): Validator {
  const compiled = compiledModule as { default?: Validator } & Validator;
  return (compiled.default ?? compiled) as Validator;
}

const validateResumeSchema = resolveValidator(compiledResumeValidate);
const validateCnProfileSchema = resolveValidator(compiledCnProfileValidate);

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/** JSON Resume 形状校验：仍用于 profile.json 导入导出这条兼容路径。 */
export function validateResume(resume: unknown): ValidationResult {
  return runValidator(validateResumeSchema, resume, 'Resume payload must be a JSON object.');
}

/**
 * CnProfile 形状校验：AI 简历解析的落库闸门。
 *
 * 校验器只认结构与字段名（`additionalProperties: false` 挡住模型凭空造字段），
 * 枚举值不在这里约束——枚举的唯一来源是 `shared/dictionary/defaults.json` 的
 * `options` 段，由 `resumeParsePrompt` 动态注入提示词，下游 `expandEnumValue`
 * 还会做中英双向归一化，所以这里再设一份 enum 只会制造第二处真相。
 */
export function validateCnProfile(profile: unknown): ValidationResult {
  return runValidator(validateCnProfileSchema, profile, 'Profile payload must be a JSON object.');
}

function runValidator(
  validate: Validator,
  payload: unknown,
  objectMessage: string,
): ValidationResult {
  if (validate(payload)) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: formatErrors(validate.errors, objectMessage),
  };
}

function formatErrors(
  errors: ErrorObject[] | null | undefined,
  objectMessage: string,
): string[] {
  if (!errors || errors.length === 0) {
    return [objectMessage];
  }

  return errors.map((error) => {
    const params = error.params as Record<string, unknown>;
    if (error.keyword === 'type' && params.type === 'object' && !error.instancePath) {
      return objectMessage;
    }
    if (error.keyword === 'required' && typeof params.missingProperty === 'string') {
      const path = error.instancePath ? `${error.instancePath}/` : '/';
      return `${path}${params.missingProperty} is required.`;
    }
    if (error.keyword === 'additionalProperties' && typeof params.additionalProperty === 'string') {
      const path = error.instancePath ? `${error.instancePath}/` : '/';
      return `${path}${params.additionalProperty} is not allowed.`;
    }
    const path = error.instancePath && error.instancePath.length > 0 ? error.instancePath : '/';
    return `${path}: ${error.message ?? 'Invalid value.'}`;
  });
}
