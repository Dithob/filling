export type FieldKind =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'select'
  | 'textarea'
  | 'contenteditable'
  | 'checkbox'
  | 'radio'
  | 'file';

export interface FieldAttributes {
  tagName: string;
  type?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  maxLength?: number;
  options?: Array<{ value: string; label: string }>;
}

export interface FieldRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ScannedField {
  id: string;
  kind: FieldKind;
  label: string;
  context: string;
  autocomplete?: string;
  required: boolean;
  /** 只读控件（自定义日期/下拉常把原生 input 设成 readonly），填充时走模拟点击路径。 */
  readOnly?: boolean;
  rect: FieldRect;
  frameId: number;
  frameUrl: string;
  attributes?: FieldAttributes;
  hasValue: boolean;
}

import type { FieldSlot } from './slotTypes';

export type PromptOptionSlot = FieldSlot | `profile.${string}`;

export interface PromptOption {
  slot: PromptOptionSlot;
  label: string;
  value: string;
}

export interface PromptFieldState {
  id: string;
  label: string;
  kind: FieldKind;
  context: string;
  autocomplete?: string | null;
  required: boolean;
}

export interface PromptAiRequestInput {
  query: string;
  currentValue: string;
  suggestion?: string;
  selectedSlot?: PromptOptionSlot | null;
  matches: PromptOption[];
}

export interface PromptAiRequestOptions {
  signal?: AbortSignal;
}

export interface PromptAiResult {
  value: string;
  slot?: PromptOptionSlot | null;
}

export interface PromptPreviewRequest {
  previewId?: string;
  fieldId: string;
  frameId: number;
  label: string;
  preview?: string;
  value?: string;
  options?: PromptOption[];
  defaultSlot?: PromptOptionSlot | null;
  profileId?: string | null;
  field?: PromptFieldState;
}

export interface PromptAiSuggestMessage {
  kind: 'PROMPT_AI_SUGGEST';
  requestId: string;
  fieldId: string;
  frameId: number;
  field: PromptFieldState;
  query: string;
  currentValue: string;
  suggestion?: string;
  selectedSlot?: PromptOptionSlot | null;
  matches: PromptOption[];
  profileId?: string | null;
}

export interface PromptAiAbortMessage {
  kind: 'PROMPT_AI_ABORT';
  requestId: string;
  fieldId: string;
  frameId: number;
}

export type PromptAiSuggestResponse =
  | { status: 'ok'; value: string; slot?: PromptOptionSlot | null }
  | { status: 'error'; error: string }
  | { status: 'aborted' }
  /**
   * 用户没有启用 AI（默认档 provider: 'none'）。与 error 区分开是必要的：
   * 浮层在打字后会自动补全，若把"没开 AI"当成错误，用户每敲几个字就会看到一条红色报错。
   */
  | { status: 'disabled' };

export interface FillFilePayload {
  name: string;
  type: string;
  /** base64：Chrome 的消息通道是 JSON 序列化，ArrayBuffer 过不去。 */
  base64: string;
}

export interface PromptFillRequest {
  requestId: string;
  fieldId: string;
  frameId: number;
  label: string;
  mode: 'fill' | 'click' | 'auto';
  value?: string;
  preview?: string;
  options?: PromptOption[];
  defaultSlot?: PromptOptionSlot | null;
  /** 命中的 slot，填充器据此决定日期格式、同义词展开等策略。 */
  slot?: PromptOptionSlot | null;
  profileId?: string | null;
  fieldKind?: FieldKind;
  fieldContext?: string;
  fieldAutocomplete?: string | null;
  fieldRequired?: boolean;
  /** 批量填充时遵守「只填空」设置：页面已有值则跳过。 */
  respectEmptyOnly?: boolean;
  /** 附件填充内容（仅 file 控件需要）。 */
  filePayload?: FillFilePayload | null;
}

export type FillResultStatus = 'filled' | 'skipped' | 'failed';

export interface FillResultMessage {
  requestId: string;
  fieldId: string;
  status: FillResultStatus;
  frameId: number;
  reason?: string;
}
