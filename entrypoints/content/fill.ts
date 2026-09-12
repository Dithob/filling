import { getElement } from './registry';
import { elementHasValue } from './fields';
import type { FieldKind, PromptOptionSlot } from '../../shared/apply/types';
import { expandEnumValue } from '../../shared/apply/value';
import { pickOptionIndex, type OptionLike } from '../../shared/apply/optionMatch';
import { detectDateInputFormat, formatDateForInput } from '../../shared/apply/dateInput';
import { base64ToUint8Array } from '../../shared/util/base64';

export interface FillFilePayload {
  name: string;
  type: string;
  base64: string;
}

export interface FillOptions {
  kind?: FieldKind | null;
  slot?: PromptOptionSlot | null;
  /** 批量「填写匹配字段」时带上，页面已有值就跳过（对应设置的「只填空」）。 */
  respectEmptyOnly?: boolean;
  filePayload?: FillFilePayload | null;
}

export type FillFailReason =
  | 'element-missing'
  | 'unsupported-kind'
  | 'no-option-match'
  | 'has-value'
  | 'no-resume-file'
  | 'widget-timeout'
  | 'empty-value'
  | 'exception';

export interface FillOutcome {
  ok: boolean;
  reason?: FillFailReason;
  /** 实际写进页面的文本，用于侧边栏回显与自检。 */
  value?: string;
}

const WIDGET_TIMEOUT_MS = 800;
const OPTION_POLL_MS = 40;

type FillableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;

function success(value?: string): FillOutcome {
  return { ok: true, value };
}

function failure(reason: FillFailReason): FillOutcome {
  return { ok: false, reason };
}

/**
 * 填充入口。返回结构化结果而不是布尔值，好让侧边栏把「为什么没填进去」讲清楚。
 */
export async function fillField(
  fieldId: string,
  value: string,
  options: FillOptions = {},
): Promise<FillOutcome> {
  const element = getElement(fieldId) as FillableElement | undefined;
  if (!element) {
    return failure('element-missing');
  }

  const kind = options.kind ?? inferKind(element);
  if (!kind) {
    return failure('unsupported-kind');
  }

  // 「只填空」：批量填充时页面已有值就跳过；单字段手动填写不受此限（用户显式操作）。
  if (options.respectEmptyOnly && elementHasValue(element)) {
    return failure('has-value');
  }

  try {
    switch (kind) {
      case 'file':
        return fillFileInput(element, options.filePayload);
      case 'select':
        return fillSelect(element, value);
      case 'radio':
        return fillRadioGroup(element, value);
      case 'checkbox':
        return fillCheckbox(element, value);
      case 'contenteditable':
        return fillContentEditable(element, value);
      default:
        return await fillTextLike(element, value, options.slot ?? null);
    }
  } catch (error) {
    console.warn('Fill failed', error);
    return failure('exception');
  }
}

export function triggerClick(fieldId: string): boolean {
  const element = getElement(fieldId);
  if (!element) {
    return false;
  }
  if (element instanceof HTMLElement) {
    element.click();
    return true;
  }
  return false;
}

function inferKind(element: Element): FieldKind | null {
  if (element instanceof HTMLSelectElement) {
    return 'select';
  }
  if (element instanceof HTMLTextAreaElement) {
    return 'textarea';
  }
  if (element instanceof HTMLInputElement) {
    switch (element.type) {
      case 'checkbox':
        return 'checkbox';
      case 'radio':
        return 'radio';
      case 'file':
        return 'file';
      case 'date':
        return 'date';
      default:
        return 'text';
    }
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    return 'contenteditable';
  }
  return null;
}

function toCandidates(value: string): string[] {
  const expanded = expandEnumValue(value);
  return expanded.length > 0 ? expanded : [value];
}

// ---------------------------------------------------------------- 文本类控件

async function fillTextLike(
  element: FillableElement,
  value: string,
  slot: PromptOptionSlot | null,
): Promise<FillOutcome> {
  if (isComboBox(element)) {
    return await fillComboBox(element, value);
  }
  if (element instanceof HTMLInputElement && element.type === 'date') {
    const formatted = formatDateForInput(value, 'YYYY-MM-DD');
    if (!formatted) {
      return failure('unsupported-kind');
    }
    setNativeValue(element, formatted);
    return success(formatted);
  }
  if (element instanceof HTMLInputElement && element.readOnly) {
    // 只读日期/下拉控件：原生赋值无效，尝试模拟点击让自定义面板接管。
    return await fillReadonlyWidget(element, value);
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const text = formatTextValue(element, value, slot);
    setNativeValue(element, text);
    return success(text);
  }
  return failure('unsupported-kind');
}

/** 日期类 slot 填进文本框时按 placeholder 猜格式；其余原样写入。 */
const DATE_SLOTS = new Set([
  'birthDate',
  'educationStartDate',
  'educationEndDate',
  'currentStartDate',
  'currentEndDate',
  'availabilityDate',
]);

function formatTextValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  slot: PromptOptionSlot | null,
): string {
  if (!slot || !DATE_SLOTS.has(slot)) {
    return value;
  }
  const formatted = formatDateForInput(value, detectDateInputFormat(element.getAttribute('placeholder')));
  return formatted ?? value;
}

function isComboBox(element: Element): boolean {
  const role = element.getAttribute('role');
  if (role === 'combobox') {
    return true;
  }
  if (element.getAttribute('aria-haspopup') === 'listbox') {
    return true;
  }
  return element.getAttribute('aria-expanded') !== null && element.getAttribute('readonly') !== null;
}

async function fillComboBox(element: FillableElement, value: string): Promise<FillOutcome> {
  const candidates = toCandidates(value);

  if (element instanceof HTMLInputElement && !element.readOnly) {
    setNativeValue(element, value);
    if (element.value.trim().length > 0) {
      return success(element.value);
    }
  }

  const options = await openAndCollectOptions(element);
  if (options.length === 0) {
    return failure('widget-timeout');
  }
  const index = pickOptionIndex(optionTexts(options), candidates);
  if (index < 0) {
    closeWidget(element);
    return failure('no-option-match');
  }
  const chosen = options[index];
  (chosen as HTMLElement).click();
  const text = (chosen.textContent ?? '').trim();
  return success(text || value);
}

async function fillReadonlyWidget(element: HTMLInputElement, value: string): Promise<FillOutcome> {
  element.click();
  const cells = await waitFor(() => findDateCells(element), WIDGET_TIMEOUT_MS);
  if (cells.length > 0) {
    const iso = formatDateForInput(value, 'YYYY-MM-DD');
    if (iso) {
      const [, , day] = iso.split('-');
      const dayCell = cells.find((cell) => {
        const text = (cell.textContent ?? '').trim();
        const title = cell.getAttribute('title') ?? '';
        return text === String(Number(day)) || title.includes(iso);
      });
      if (dayCell) {
        (dayCell as HTMLElement).click();
        return success(element.value || iso);
      }
    }
  }
  closeWidget(element);
  return failure('widget-timeout');
}

function closeWidget(element: Element): void {
  try {
    (element as HTMLElement).blur();
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  } catch {
    /* 忽略：关闭失败不影响结果判定 */
  }
}

// ---------------------------------------------------------------- 选择类控件

function fillSelect(element: FillableElement, value: string): FillOutcome {
  if (!(element instanceof HTMLSelectElement)) {
    return failure('unsupported-kind');
  }
  const options: OptionLike[] = Array.from(element.options).map((option) => ({
    value: option.value,
    label: (option.textContent ?? '').trim(),
  }));
  const index = pickOptionIndex(options, toCandidates(value));
  if (index < 0) {
    // 不再直接写 element.value：option 里没有这个值只会把选择清空。
    return failure('no-option-match');
  }
  element.selectedIndex = index;
  dispatchInput(element);
  return success(options[index].label || options[index].value);
}

function fillRadioGroup(element: FillableElement, value: string): FillOutcome {
  if (!(element instanceof HTMLInputElement)) {
    return failure('unsupported-kind');
  }
  const root = element.getRootNode() as Document | ShadowRoot;
  const name = element.getAttribute('name');
  const group = name
    ? Array.from(root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${cssEscape(name)}"]`))
    : [element];
  const options: OptionLike[] = group.map((radio, index) => ({
    value: String(index),
    label: describeRadio(radio),
  }));
  const index = pickOptionIndex(options, toCandidates(value));
  if (index < 0) {
    return failure('no-option-match');
  }
  const target = group[index];
  target.click();
  if (!target.checked) {
    target.checked = true;
    dispatchInput(target);
  }
  return success(options[index].label);
}

function describeRadio(radio: HTMLInputElement): string {
  const label = radio.labels && radio.labels[0] ? radio.labels[0].textContent : null;
  if (label && label.trim()) {
    return label.trim();
  }
  const aria = radio.getAttribute('aria-label');
  if (aria && aria.trim()) {
    return aria.trim();
  }
  const closest = radio.closest('label');
  if (closest && closest.textContent && closest.textContent.trim()) {
    return closest.textContent.trim();
  }
  return radio.value;
}

function fillCheckbox(element: FillableElement, value: string): FillOutcome {
  if (!(element instanceof HTMLInputElement)) {
    return failure('unsupported-kind');
  }
  element.checked = /^(true|1|yes|on|是|同意|接受)$/i.test(value.trim());
  dispatchInput(element);
  return success(String(element.checked));
}

// ---------------------------------------------------------------- 富文本 / 附件

function fillContentEditable(element: FillableElement, value: string): FillOutcome {
  element.focus();
  const doc = element.ownerDocument;
  const selection = doc.getSelection();
  let inserted = false;
  if (selection) {
    const range = doc.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    try {
      inserted = doc.execCommand('insertText', false, value);
    } catch {
      inserted = false;
    }
  }
  if (!inserted) {
    element.textContent = value;
  }
  dispatchInput(element);
  return success(value);
}

function fillFileInput(element: FillableElement, payload: FillFilePayload | null | undefined): FillOutcome {
  if (!(element instanceof HTMLInputElement) || element.type !== 'file') {
    return failure('unsupported-kind');
  }
  if (!payload || !payload.base64) {
    return failure('no-resume-file');
  }
  const bytes = base64ToUint8Array(payload.base64);
  const file = new File([bytes], payload.name || 'resume.pdf', {
    type: payload.type || 'application/pdf',
  });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  element.files = transfer.files;
  dispatchInput(element);
  return success(file.name);
}

// ---------------------------------------------------------------- 小工具

function optionTexts(options: Element[]): OptionLike[] {
  return options.map((option) => ({
    value: option.getAttribute('data-value') ?? '',
    label: (option.textContent ?? '').trim(),
  }));
}

/** 展开面板并轮询等待选项渲染出来（自定义组件大多是异步渲染）。 */
async function openAndCollectOptions(element: FillableElement): Promise<Element[]> {
  const findOptions = (): Element[] => {
    const root = element.getRootNode() as Document | ShadowRoot;
    return Array.from(root.querySelectorAll('[role="option"], [role="menuitem"]')).filter(isVisible);
  };

  let options = findOptions();
  if (options.length > 0) {
    return options;
  }
  element.click();
  options = await waitFor(findOptions, WIDGET_TIMEOUT_MS);
  return options;
}

function findDateCells(element: Element): Element[] {
  const root = element.getRootNode() as Document | ShadowRoot;
  return Array.from(
    root.querySelectorAll('[class*="cell"], [class*="date"], td[title], [role="gridcell"]'),
  ).filter(isVisible);
}

async function waitFor<T>(probe: () => T[], timeoutMs: number): Promise<T[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = probe();
    if (found.length > 0) {
      return found;
    }
    if (Date.now() >= deadline) {
      return [];
    }
    await new Promise((resolve) => window.setTimeout(resolve, OPTION_POLL_MS));
  }
}

function isVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (element.offsetParent !== null) {
    return true;
  }
  return element.getClientRects().length > 0;
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
  dispatchInput(element);
}

function dispatchInput(element: HTMLElement): void {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}
