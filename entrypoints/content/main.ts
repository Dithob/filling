import { browser } from 'wxt/browser';
import type {
  FieldAttributes,
  FieldKind,
  FillResultStatus,
  PromptFieldState,
  PromptFillRequest,
  PromptOptionSlot,
  PromptPreviewRequest,
} from '../../shared/apply/types';
import { fillField, triggerClick, type FillOptions, type FillOutcome } from './fill';
import type { InternalField } from './fields';
import { buildFieldForElement, elementHasValue, scanFields } from './fields';
import { clearOverlay, showHighlight, showPrompt } from './overlay';
import { clearRegistry, getElement } from './registry';
import { deepActiveElement, focusStep } from './tabbable';

type ContentInboundMessage =
  | {
      kind: 'SCAN_FIELDS';
      requestId: string;
    }
  | {
      kind: 'SET_DOM_ACCESS';
      allowed: boolean;
    }
  | {
      kind: 'SET_OVERLAY_ACCESS';
      allowed: boolean;
    }
  | ({ kind: 'PROMPT_FILL'; scrollIntoView?: boolean } & PromptFillRequest)
  | ({ kind: 'PROMPT_PREVIEW'; scrollIntoView?: boolean } & PromptPreviewRequest)
  | {
      kind: 'HIGHLIGHT_FIELD';
      fieldId: string;
      label: string;
      scrollIntoView?: boolean;
    }
  | {
      kind: 'CLEAR_OVERLAY';
    }
  | {
      kind: 'FOCUS_FIELD';
      fieldId: string;
      scrollIntoView?: boolean;
    }
  | {
      kind: 'GUIDED_STEP';
      direction?: 1 | -1;
      wrap?: boolean;
    }
  | {
      kind: 'GUIDED_RESET';
    }
  | {
      kind: 'GUIDED_REQUEST_CURRENT';
    };

type ContentOutboundMessage =
  | {
      kind: 'FIELDS';
      requestId: string;
      fields: SerializedField[];
      frameUrl: string;
    }
  | {
      kind: 'FILL_RESULT';
      requestId: string;
      fieldId: string;
      status: FillResultStatus;
      reason?: string;
    }
  | {
      kind: 'GUIDED_CANDIDATE';
      field: SerializedField;
      frameUrl: string;
      origin: 'focus' | 'step' | 'request';
    }
  | {
      kind: 'GUIDED_INPUT_CAPTURE';
      field: SerializedField;
      frameUrl: string;
      value: string;
    };

interface SerializedField {
  id: string;
  kind: string;
  label: string;
  context: string;
  autocomplete?: string;
  required: boolean;
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  attributes?: FieldAttributes;
  hasValue: boolean;
  readOnly?: boolean;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    const fieldMetadata = new Map<
      string,
      {
        label: string;
        kind: FieldKind;
        context: string;
        autocomplete?: string;
        required: boolean;
      }
    >();
    const ignoreCaptures = new Set<string>();
    let lastGuidedId: string | null = null;
    let domAccessAllowed = false;
    let overlayAccessAllowed = false;
    let focusListenersAttached = false;

    const port = browser.runtime.connect({ name: 'content' });

    const setDomAccessAllowed = (allowed: boolean) => {
      domAccessAllowed = allowed;
      if (!allowed) {
        clearOverlay();
        clearRegistry();
        fieldMetadata.clear();
        ignoreCaptures.clear();
        lastGuidedId = null;
      }
    };

    const setOverlayAccessAllowed = (allowed: boolean) => {
      overlayAccessAllowed = allowed;
      syncFocusListeners();
      if (!allowed) {
        clearOverlay();
        ignoreCaptures.clear();
        lastGuidedId = null;
      }
    };

    function handleFocusIn(): void {
      if (!overlayAccessAllowed) {
        return;
      }
      const active = deepActiveElement();
      if (!active) {
        return;
      }
      const field = buildFieldForElement(active);
      if (!field) {
        return;
      }
      emitGuidedCandidate(field, 'focus');
    }

    function handleFocusOut(event: FocusEvent): void {
      if (!overlayAccessAllowed) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const field = buildFieldForElement(target);
      if (!field) {
        return;
      }
      if (ignoreCaptures.has(field.id)) {
        ignoreCaptures.delete(field.id);
        return;
      }
      if (!shouldCaptureValue(target)) {
        return;
      }
      const value = readElementValue(target);
      if (!value.trim()) {
        return;
      }
      emitGuidedInputCapture(field, value);
    }

    function attachFocusListeners(): void {
      if (focusListenersAttached) {
        return;
      }
      document.addEventListener('focusin', handleFocusIn, true);
      document.addEventListener('focusout', handleFocusOut, true);
      focusListenersAttached = true;
    }

    function detachFocusListeners(): void {
      if (!focusListenersAttached) {
        return;
      }
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      focusListenersAttached = false;
    }

    function syncFocusListeners(): void {
      if (overlayAccessAllowed) {
        attachFocusListeners();
      } else {
        detachFocusListeners();
      }
    }

    port.onMessage.addListener((message: ContentInboundMessage) => {
      switch (message.kind) {
        case 'SCAN_FIELDS':
          handleScan(message.requestId);
          break;
        case 'SET_DOM_ACCESS':
          setDomAccessAllowed(Boolean(message.allowed));
          break;
        case 'SET_OVERLAY_ACCESS':
          setOverlayAccessAllowed(Boolean(message.allowed));
          break;
        case 'PROMPT_FILL':
          void handlePromptFill(message);
          break;
        case 'PROMPT_PREVIEW':
          handlePromptPreview(message);
          break;
        case 'HIGHLIGHT_FIELD':
          handleHighlight(message.fieldId, message.label, message.scrollIntoView);
          break;
        case 'CLEAR_OVERLAY':
          clearOverlay();
          break;
        case 'FOCUS_FIELD':
          handleFocus(message.fieldId, message.scrollIntoView);
          break;
        case 'GUIDED_STEP':
          handleGuidedStep(message.direction, message.wrap);
          break;
        case 'GUIDED_RESET':
          handleGuidedReset();
          break;
        case 'GUIDED_REQUEST_CURRENT':
          handleGuidedRequestCurrent();
          break;
      }
    });

    port.onDisconnect.addListener(() => {
      clearOverlay();
      clearRegistry();
      fieldMetadata.clear();
      ignoreCaptures.clear();
      lastGuidedId = null;
      detachFocusListeners();
    });

    function send(message: ContentOutboundMessage): void {
      port.postMessage(message);
    }

    function rememberField(field: InternalField): void {
      fieldMetadata.set(field.id, {
        label: field.label,
        kind: field.kind,
        context: field.context,
        autocomplete: field.autocomplete,
        required: field.required,
      });
    }

    /** 把消息里的填充参数收敛成 fillField 需要的形状。 */
    function fillOptionsFor(
      message: Extract<ContentInboundMessage, { kind: 'PROMPT_FILL' }>,
    ): FillOptions {
      const meta = fieldMetadata.get(message.fieldId);
      return {
        kind: meta?.kind ?? message.fieldKind ?? null,
        slot: message.slot ?? message.defaultSlot ?? null,
        respectEmptyOnly: message.respectEmptyOnly === true,
        filePayload: message.filePayload ?? null,
      };
    }

    function sendFillResult(
      message: Extract<ContentInboundMessage, { kind: 'PROMPT_FILL' }>,
      outcome: FillOutcome,
    ): void {
      send({
        kind: 'FILL_RESULT',
        requestId: message.requestId,
        fieldId: message.fieldId,
        status: outcome.ok ? 'filled' : 'failed',
        reason: outcome.ok ? undefined : outcome.reason,
      });
    }

    function emitGuidedCandidate(field: InternalField, origin: 'focus' | 'step' | 'request'): void {
      if (!overlayAccessAllowed) {
        return;
      }
      if (origin !== 'request' && lastGuidedId === field.id) {
        return;
      }
      lastGuidedId = field.id;
      rememberField(field);
      send({
        kind: 'GUIDED_CANDIDATE',
        field: serializeField(field),
        frameUrl: window.location.href,
        origin,
      });
    }

    function emitGuidedInputCapture(field: InternalField, value: string): void {
      if (!overlayAccessAllowed) {
        return;
      }
      rememberField(field);
      send({
        kind: 'GUIDED_INPUT_CAPTURE',
        field: serializeField(field),
        frameUrl: window.location.href,
        value,
      });
    }

    function markProgrammaticFill(fieldId: string): void {
      ignoreCaptures.add(fieldId);
      window.setTimeout(() => {
        ignoreCaptures.delete(fieldId);
      }, 250);
    }

    function shouldCaptureValue(element: Element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
      if (element instanceof HTMLInputElement) {
        const type = element.type?.toLowerCase?.() ?? '';
        if (type === 'password' || type === 'file' || type === 'button' || type === 'submit' || type === 'reset') {
          return false;
        }
        return true;
      }
      if (element instanceof HTMLTextAreaElement) {
        return true;
      }
      if (element instanceof HTMLSelectElement) {
        return true;
      }
      return false;
    }

    function readElementValue(element: Element): string {
      if (element instanceof HTMLInputElement) {
        const type = element.type?.toLowerCase?.() ?? '';
        if (type === 'checkbox' || type === 'radio') {
          if (!element.checked) {
            return '';
          }
          return element.value ?? '';
        }
        return element.value ?? '';
      }
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        return element.value ?? '';
      }
      return '';
    }

    function handleScan(requestId: string): void {
      if (!domAccessAllowed) {
        send({
          kind: 'FIELDS',
          requestId,
          fields: [],
          frameUrl: window.location.href,
        });
        return;
      }
      const fields = scanFields();
      fieldMetadata.clear();
      fields.forEach(rememberField);

      send({
        kind: 'FIELDS',
        requestId,
        fields: serialize(fields),
        frameUrl: window.location.href,
      });
    }

    async function handlePromptFill(message: Extract<ContentInboundMessage, { kind: 'PROMPT_FILL' }>): Promise<void> {
      if (!domAccessAllowed && !overlayAccessAllowed) {
        send({
          kind: 'FILL_RESULT',
          requestId: message.requestId,
          fieldId: message.fieldId,
          status: 'failed',
          reason: 'no-permission',
        });
        return;
      }
      const meta = fieldMetadata.get(message.fieldId);
      if (!meta) {
        send({
          kind: 'FILL_RESULT',
          requestId: message.requestId,
          fieldId: message.fieldId,
          status: 'failed',
          reason: 'missing-field',
        });
        return;
      }

      if (message.mode === 'click') {
        const success = triggerClick(message.fieldId);
        send({
          kind: 'FILL_RESULT',
          requestId: message.requestId,
          fieldId: message.fieldId,
          status: success ? 'filled' : 'failed',
          reason: success ? undefined : 'click-failed',
        });
        return;
      }

      if (message.mode === 'auto') {
        const element = getElement(message.fieldId);
        const value = typeof message.value === 'string' ? message.value : '';
        if (!element || !(element instanceof HTMLElement)) {
          send({
            kind: 'FILL_RESULT',
            requestId: message.requestId,
            fieldId: message.fieldId,
            status: 'failed',
            reason: 'missing-element',
          });
          return;
        }
        if (!value.trim()) {
          send({
            kind: 'FILL_RESULT',
            requestId: message.requestId,
            fieldId: message.fieldId,
            status: 'failed',
            reason: 'empty-value',
          });
          return;
        }
        const outcome = await fillField(message.fieldId, value, fillOptionsFor(message));
        sendFillResult(message, outcome);
        clearOverlay();
        return;
      }

      const element = getElement(message.fieldId);
      if (!element || !(element instanceof HTMLElement)) {
        send({
          kind: 'FILL_RESULT',
          requestId: message.requestId,
          fieldId: message.fieldId,
          status: 'failed',
          reason: 'missing-element',
        });
        return;
      }

      if (message.mode === 'fill' && (!message.options || message.options.length === 0)) {
        const value = typeof message.value === 'string' ? message.value : '';
        if (!value.trim()) {
          send({
            kind: 'FILL_RESULT',
            requestId: message.requestId,
            fieldId: message.fieldId,
            status: 'failed',
            reason: 'empty-value',
          });
          clearOverlay();
          return;
        }
        markProgrammaticFill(message.fieldId);
        const outcome = await fillField(message.fieldId, value, fillOptionsFor(message));
        sendFillResult(message, outcome);
        clearOverlay();
        return;
      }

      const profileId = message.profileId ?? null;
      const contextOverride =
        meta.context && meta.context.trim().length > 0
          ? meta.context
          : typeof message.fieldContext === 'string'
            ? message.fieldContext
            : '';
      const autocompleteOverride =
        meta.autocomplete ?? (typeof message.fieldAutocomplete === 'string' ? message.fieldAutocomplete : undefined);
      const promptField: PromptFieldState = {
        id: message.fieldId,
        label: meta.label,
        kind: meta.kind,
        context: contextOverride,
        autocomplete: autocompleteOverride,
        required: meta.required,
      };

      showPrompt(element, {
        requestId: message.requestId,
        label: message.label || meta.label,
        preview: message.preview,
        options: message.options,
        defaultSlot: message.defaultSlot ?? null,
        defaultValue: message.value,
        field: promptField,
        profileId,
        scrollIntoView: message.scrollIntoView,
        onFill: (selectedValue) => {
          const value = selectedValue && selectedValue.trim().length > 0 ? selectedValue : message.value ?? '';
          if (!value) {
            send({
              kind: 'FILL_RESULT',
              requestId: message.requestId,
              fieldId: message.fieldId,
              status: 'failed',
              reason: 'no-selection',
            });
            clearOverlay();
            return;
          }
          markProgrammaticFill(message.fieldId);
          void fillField(message.fieldId, value, fillOptionsFor(message)).then((outcome) => {
            sendFillResult(message, outcome);
            clearOverlay();
          });
        },
        onSkip: () => {
          send({
            kind: 'FILL_RESULT',
            requestId: message.requestId,
            fieldId: message.fieldId,
            status: 'skipped',
          });
          clearOverlay();
        },
      });
    }

    function handlePromptPreview(message: Extract<ContentInboundMessage, { kind: 'PROMPT_PREVIEW' }>): void {
      if (!overlayAccessAllowed) {
        return;
      }
      const meta = fieldMetadata.get(message.fieldId);
      const element = getElement(message.fieldId);
      if (!element || !(element instanceof HTMLElement)) {
        return;
      }

      const requestId = message.previewId && message.previewId.trim().length > 0 ? message.previewId : `preview:${message.fieldId}`;
      const profileId = message.profileId ?? null;

      let promptField: PromptFieldState | null = message.field ?? null;
      if (!promptField && meta) {
        promptField = {
          id: message.fieldId,
          label: meta.label,
          kind: meta.kind,
          context: meta.context,
          autocomplete: meta.autocomplete,
          required: meta.required,
        };
      }
      if (!promptField) {
        promptField = {
          id: message.fieldId,
          label: message.label,
          kind: meta?.kind ?? 'text',
          context: meta?.context ?? '',
          autocomplete: meta?.autocomplete,
          required: meta?.required ?? false,
        };
      }

      const resolvedLabel = message.label.length > 0 ? message.label : promptField.label;
      const baseValue = message.value ?? message.preview ?? '';

      const promptFieldSnapshot = promptField;

      showPrompt(element, {
        requestId,
        label: resolvedLabel,
        preview: message.preview,
        options: message.options,
        defaultSlot: message.defaultSlot ?? null,
        defaultValue: message.value ?? undefined,
        field: promptFieldSnapshot,
        profileId,
        scrollIntoView: message.scrollIntoView,
        onFill: (selectedValue) => {
          const value = selectedValue && selectedValue.trim().length > 0 ? selectedValue : baseValue;
          if (!value.trim()) {
            clearOverlay();
            return;
          }
          markProgrammaticFill(message.fieldId);
          void fillField(message.fieldId, value, {
            kind: promptFieldSnapshot.kind,
            slot: message.defaultSlot ?? null,
            filePayload: null,
          }).then((outcome) => {
            send({
              kind: 'FILL_RESULT',
              requestId,
              fieldId: message.fieldId,
              status: outcome.ok ? 'filled' : 'failed',
              reason: outcome.ok ? undefined : outcome.reason,
            });
            clearOverlay();
          });
        },
        onSkip: () => {
          clearOverlay();
        },
      });
    }

    function handleHighlight(fieldId: string, label: string, scrollIntoView: boolean | undefined): void {
      if (!domAccessAllowed) {
        return;
      }
      const target = getElement(fieldId);
      if (!target) {
        clearOverlay();
        return;
      }
      showHighlight(target, { label, scrollIntoView });
    }

    function handleFocus(fieldId: string, scrollIntoView: boolean | undefined): void {
      if (!domAccessAllowed) {
        return;
      }
      const target = getElement(fieldId);
      if (!target || !(target instanceof HTMLElement)) {
        return;
      }
      clearOverlay();
      try {
        if (scrollIntoView !== false) {
          target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        }
      } catch (error) {
        console.warn('scrollIntoView failed', error);
      }
      queueMicrotask(() => {
        try {
          target.focus({ preventScroll: true });
        } catch {
          // Element might not be focusable; ignore.
        }
        showHighlight(target, { label: '', duration: 1000, scrollIntoView: false });
      });
    }

    function handleGuidedStep(direction?: number, wrap?: boolean): void {
      if (!overlayAccessAllowed) {
        return;
      }
      const dir: 1 | -1 = direction === -1 ? -1 : 1;
      const next = focusStep({ direction: dir, wrap: wrap !== false });
      if (!next) {
        return;
      }
      const field = buildFieldForElement(next);
      if (!field) {
        return;
      }
      emitGuidedCandidate(field, 'step');
    }

    function handleGuidedReset(): void {
      if (!overlayAccessAllowed) {
        return;
      }
      lastGuidedId = null;
    }

    function handleGuidedRequestCurrent(): void {
      if (!overlayAccessAllowed) {
        return;
      }
      const active = deepActiveElement();
      if (!active) {
        return;
      }
      const field = buildFieldForElement(active);
      if (!field) {
        return;
      }
      emitGuidedCandidate(field, 'request');
    }
  },
});

function serializeField(field: InternalField): SerializedField {
  return {
    id: field.id,
    kind: field.kind,
    label: field.label,
    context: field.context,
    autocomplete: field.autocomplete,
    required: field.required,
    rect: field.rect,
    attributes: field.attributes,
    hasValue: field.hasValue,
    readOnly: field.readOnly,
  };
}

function serialize(fields: InternalField[]): SerializedField[] {
  return fields.map(serializeField);
}
