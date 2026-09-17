import type { ErrorObject } from 'ajv';

export type CnProfileValidate = ((data: unknown) => boolean) & {
  errors?: ErrorObject[] | null;
};

declare const validate: CnProfileValidate;
export = validate;
export default validate;
