import { computeAccessibleName } from 'dom-accessibility-api';
import type { FieldAttributes, FieldKind, FieldRect } from '../../shared/apply/types';
import { clearRegistry, registerElement } from './registry';

type SupportedElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;

export interface InternalField {
  id: string;
  element: SupportedElement;
  kind: FieldKind;
  label: string;
  context: string;
  autocomplete?: string;
  required: boolean;
  readOnly: boolean;
  rect: FieldRect;
  attributes: FieldAttributes;
  hasValue: boolean;
}

const elementIds = new WeakMap<Element, string>();

const FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="textbox"][contenteditable]',
].join(', ');

/**
 * 递归扫描（含 open shadow root）。
 * 上游只查 document，Moka / 北森这类用 Web Component 封装的表单控件会整片漏掉。
 * closed shadow root 无法穿透，这是已知限制。
 */
export function scanFields(): InternalField[] {
  clearRegistry();

  const nodes: SupportedElement[] = [];
  const seen = new Set<Element>();
  collectFieldElements(document, nodes, seen);

  const candidates: InternalField[] = [];

  for (const element of nodes) {
    const field = buildFieldForElement(element);
    if (field) {
      candidates.push(field);
    }
  }

  candidates.sort((a, b) => {
    const top = a.rect.top - b.rect.top;
    if (Math.abs(top) > 1) {
      return top;
    }
    return a.rect.left - b.rect.left;
  });

  return candidates;
}

function collectFieldElements(
  root: Document | ShadowRoot,
  out: SupportedElement[],
  seen: Set<Element>,
): void {
  for (const element of Array.from(root.querySelectorAll<SupportedElement>(FIELD_SELECTOR))) {
    if (seen.has(element)) {
      continue;
    }
    seen.add(element);
    out.push(element);
  }
  for (const element of Array.from(root.querySelectorAll('*'))) {
    const shadow = (element as HTMLElement).shadowRoot;
    if (shadow) {
      collectFieldElements(shadow, out, seen);
    }
  }
}

export function buildFieldForElement(element: Element): InternalField | null {
  if (!isSupported(element)) {
    return null;
  }
  if (!isEditable(element)) {
    return null;
  }

  const kind = classify(element);
  if (!kind) {
    return null;
  }

  const id = ensureElementId(element);
  const label = buildLabel(element);
  const rect = extractRect(element);
  const autocomplete = (element as HTMLInputElement).autocomplete;
  const context = buildContext(element, label);
  const attributes = extractAttributes(element);
  const hasValue = elementHasValue(element);
  const readOnly = element instanceof HTMLInputElement ? element.readOnly : false;

  registerElement(id, element);

  return {
    id,
    element,
    kind,
    label,
    context,
    rect,
    required: isRequired(element),
    readOnly,
    autocomplete: autocomplete && autocomplete !== 'on' ? autocomplete : undefined,
    attributes,
    hasValue,
  };
}

function isSupported(element: Element): element is SupportedElement {
  if (element instanceof HTMLTextAreaElement) {
    return true;
  }
  if (element instanceof HTMLSelectElement) {
    return true;
  }
  if (element instanceof HTMLInputElement) {
    return element.type !== 'hidden';
  }
  return element instanceof HTMLElement && isContentEditableElement(element);
}

function isContentEditableElement(element: HTMLElement): boolean {
  const attr = element.getAttribute('contenteditable');
  if (attr !== null && attr !== 'false') {
    return true;
  }
  return element.isContentEditable === true && element.getAttribute('role') === 'textbox';
}

/**
 * 只读控件不再一律排除：国内 ATS 的日期 / 下拉常常把原生 input 设成 readonly，
 * 由自定义面板接管。排除它们等于这些字段永远填不了，所以保留并打上 readOnly 标记，
 * 由填充器走「模拟点击 + 面板匹配」的路径。
 */
function isEditable(element: SupportedElement): boolean {
  if (element instanceof HTMLInputElement) {
    if (element.type === 'button' || element.type === 'submit' || element.type === 'reset') {
      return false;
    }
  }
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    if (element.hasAttribute('disabled')) {
      return false;
    }
  }
  return true;
}

function classify(element: SupportedElement): FieldKind | null {
  if (element instanceof HTMLTextAreaElement) {
    return 'textarea';
  }
  if (element instanceof HTMLSelectElement) {
    return 'select';
  }
  if (element instanceof HTMLInputElement) {
    switch (element.type) {
      case 'text':
      case 'url':
      case 'search':
      case 'password':
        return 'text';
      case 'email':
        return 'email';
      case 'tel':
        return 'tel';
      case 'number':
        return 'number';
      case 'date':
      case 'month':
        return 'date';
      case 'checkbox':
        return 'checkbox';
      case 'radio':
        return 'radio';
      case 'file':
        return 'file';
      default:
        return null;
    }
  }
  if (element instanceof HTMLElement && isContentEditableElement(element)) {
    return 'contenteditable';
  }
  return null;
}

function buildLabel(element: SupportedElement): string {
  const accessible = computeAccessibleName(element).trim();
  if (accessible.length > 0) {
    return accessible;
  }
  const placeholder =
    'placeholder' in element ? element.placeholder.trim() : element.getAttribute('placeholder')?.trim() ?? '';
  if (placeholder.length > 0) {
    return placeholder;
  }
  if ('name' in element && typeof element.name === 'string' && element.name.trim().length > 0) {
    return element.name.trim();
  }
  if ('id' in element && typeof element.id === 'string' && element.id.trim().length > 0) {
    return element.id.trim();
  }
  return '';
}

function extractRect(element: SupportedElement): FieldRect {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function buildContext(element: SupportedElement, label: string): string {
  const parts = new Set<string>();

  const add = (value: unknown) => {
    if (typeof value !== 'string') {
      return;
    }
    const normalized = normalizeContext(value);
    if (normalized.length > 0) {
      parts.add(normalized);
    }
  };

  add(label);

  if (element instanceof HTMLInputElement) {
    add(element.placeholder);
    add(element.name);
    add(element.id);
    add(element.getAttribute('autocomplete'));
  } else {
    add(element.getAttribute('placeholder'));
    add(element.getAttribute('name'));
    add(element.getAttribute('id'));
    add(element.getAttribute('autocomplete'));
  }

  add(element.getAttribute('aria-label'));
  add(element.getAttribute('aria-description'));
  add(element.getAttribute('title'));
  add(element.className);

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    labelledBy
      .split(/\s+/)
      .filter(Boolean)
      .forEach((id) => {
        const node = document.getElementById(id);
        if (node?.textContent) {
          add(node.textContent);
        }
      });
  }

  const describedBy = element.getAttribute('aria-describedby');
  if (describedBy) {
    describedBy
      .split(/\s+/)
      .filter(Boolean)
      .forEach((id) => {
        const node = document.getElementById(id);
        if (node?.textContent) {
          add(node.textContent);
        }
      });
  }

  if ('labels' in element && element.labels) {
    for (const node of Array.from(element.labels)) {
      if (node?.textContent) {
        add(node.textContent);
      }
    }
  }

  const enclosingLabel = element.closest('label');
  if (enclosingLabel?.textContent) {
    add(enclosingLabel.textContent);
  }

  const forLabel =
    element.id && typeof element.id === 'string'
      ? document.querySelector(`label[for="${escapeSelector(element.id)}"]`)
      : null;
  if (forLabel instanceof HTMLLabelElement && forLabel.textContent) {
    add(forLabel.textContent);
  }

  const container = element.closest<HTMLElement>(
    '.el-form-item, .ant-form-item, .form-item, .field, .form-group, [class*="field"], [class*="Form"], [class*="row"], tr',
  );
  if (container?.textContent) {
    add(container.textContent);
  }

  const parent = element.parentElement;
  if (parent?.textContent) {
    add(parent.textContent);
  }

  if (parts.size === 0) {
    return '';
  }

  const combined = Array.from(parts).join('|');
  return combined.length > 2000 ? combined.slice(0, 2000) : combined;
}

function extractAttributes(element: SupportedElement): FieldAttributes {
  const tagName = element.tagName.toLowerCase();
  const normalize = (value: string | null | undefined) => {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const attributes: FieldAttributes = {
    tagName,
    ariaLabel: normalize(element.getAttribute('aria-label')),
  };

  if (element instanceof HTMLInputElement) {
    attributes.type = normalize(element.type);
    attributes.name = normalize(element.name);
    attributes.id = normalize(element.id);
    attributes.placeholder = normalize(element.placeholder);
    attributes.maxLength = element.maxLength > 0 ? element.maxLength : undefined;
  } else if (element instanceof HTMLTextAreaElement) {
    attributes.name = normalize(element.name);
    attributes.id = normalize(element.id);
    attributes.placeholder = normalize(element.placeholder);
    attributes.maxLength = element.maxLength > 0 ? element.maxLength : undefined;
  } else if (element instanceof HTMLSelectElement) {
    attributes.name = normalize(element.name);
    attributes.id = normalize(element.id);
    const options = Array.from(element.options)
      .slice(0, 20)
      .map((option) => ({
        value: normalize(option.value) ?? '',
        label: normalize(option.textContent) ?? '',
      }))
      .filter((entry) => entry.label || entry.value);
    if (options.length > 0) {
      attributes.options = options;
    }
  }

  return attributes;
}

export function elementHasValue(element: SupportedElement): boolean {
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox' || element.type === 'radio') {
      return element.checked;
    }
    if (element.type === 'file') {
      return (element.files?.length ?? 0) > 0;
    }
    return element.value.trim().length > 0;
  }
  if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    return element.value.trim().length > 0;
  }
  return (element.textContent ?? '').trim().length > 0;
}

function ensureElementId(element: Element): string {
  const existing = elementIds.get(element);
  if (existing) {
    return existing;
  }
  const id = crypto.randomUUID();
  elementIds.set(element, id);
  return id;
}

function normalizeContext(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function escapeSelector(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}

function isRequired(element: SupportedElement): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    return Boolean(element.required);
  }
  return false;
}
