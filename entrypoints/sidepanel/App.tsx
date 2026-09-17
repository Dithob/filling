import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { Eraser, RefreshCcw, Sparkles, Users } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { browser } from 'wxt/browser';
import { listProfiles } from '../../shared/storage/profiles';
import type { AppSettings, ProfileRecord, StoredFileReference } from '../../shared/types';
import type {
  FillFilePayload,
  FillResultMessage,
  PromptOption,
  PromptOptionSlot,
  ScannedField,
} from '../../shared/apply/types';
import type { FieldSlot } from '../../shared/apply/slotTypes';
import { buildManualValueTree, type ManualValueNode } from '../../shared/apply/manualValues';
import { buildProfilePromptOptions } from '../../shared/apply/promptOptions';
import { matchCustomAnswer } from '../../shared/apply/customFallback';
import { getFileBuffer } from '../../shared/storage/profiles';
import { arrayBufferToBase64 } from '../../shared/util/base64';
import { formatSlotLabel } from '../../shared/apply/slotLabels';
import { getAllAdapterIds } from '../../shared/apply/slots';
import { hydrateDictionary, subscribeDictionary } from '../../shared/dictionary/store';
import { resolveFieldSlot } from '../../shared/apply/fieldMapping';
import { buildSlotValues, buildCustomAnswers, type SlotValueMap } from '../../shared/apply/profile';
import { getSettings } from '../../shared/storage/settings';
import { PromptEditor } from '../shared/components/PromptEditor';
import { FieldReviewMode } from './components/FieldReviewMode';
import { ManualCopyMode } from './components/ManualCopyMode';
import type { FieldEntry, FieldStatus, ViewState } from './types';

function isFieldSlotValue(slot: PromptOptionSlot | null | undefined): slot is FieldSlot {
  return typeof slot === 'string' && !slot.startsWith('profile.');
}

type PanelMode = 'dom' | 'manual';

type RuntimePort = ReturnType<typeof browser.runtime.connect>;

export default function App() {
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [mode, setMode] = useState<PanelMode>('dom');
  const [fields, setFields] = useState<FieldEntry[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [scanRequestId, setScanRequestId] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewState>({ loadingProfiles: true });
  const [scanning, setScanning] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  // 字段字典的修订号：字典热更（storage 里的 dictionary:v1 变动）时 +1，
  // 用来让依赖「可用适配器列表」的 memo 重新求值。匹配本身读的是 store 的
  // 同步缓存，所以只有这里的 memo 需要感知变化。
  const [dictionaryRevision, setDictionaryRevision] = useState(0);
  const defaultAdapterIds = useMemo(() => getAllAdapterIds(), [dictionaryRevision]);
  const [activeAdapterIds, setActiveAdapterIds] = useState<string[]>(defaultAdapterIds);
  const { t } = i18n;
  const tLoose = i18n.t as unknown as (key: string, params?: unknown[]) => string;

  const portRef = useRef<RuntimePort | null>(null);
  const permissionRef = useRef(permissionGranted);
  const slotValuesRef = useRef<SlotValueMap>({});
  const customAnswersRef = useRef<Record<string, string>>({});
  const fillModeRef = useRef<AppSettings['fillMode']>('emptyOnly');
  const scanRequestIdRef = useRef<string | null>(null);
  const adapterIdsRef = useRef<string[]>(defaultAdapterIds);
  const fillResolversRef = useRef<Map<string, (result: FillResultMessage) => void>>(new Map());
  const fieldsRef = useRef<FieldEntry[]>([]);
  const selectedFieldRef = useRef<string | null>(null);
  const lastFocusedFieldRef = useRef<string | null>(null);
  const nextFocusScrollRef = useRef(true);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );
  const selectedProfileIdValue = selectedProfile?.id ?? null;

  const slotValues = useMemo(() => buildSlotValues(selectedProfile), [selectedProfile]);
  const customAnswers = useMemo(() => buildCustomAnswers(selectedProfile), [selectedProfile]);

  useEffect(() => {
    slotValuesRef.current = slotValues;
  }, [slotValues]);

  useEffect(() => {
    customAnswersRef.current = customAnswers;
  }, [customAnswers]);

  useEffect(() => {
    if (fields.length === 0) {
      nextFocusScrollRef.current = true;
      setSelectedFieldId(null);
      return;
    }
    if (!selectedFieldRef.current || !fields.some((entry) => entry.field.id === selectedFieldRef.current)) {
      nextFocusScrollRef.current = true;
      setSelectedFieldId(fields[0].field.id);
    }
  }, [fields]);

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  useEffect(() => {
    selectedFieldRef.current = selectedFieldId;
  }, [selectedFieldId]);

  useEffect(() => {
    adapterIdsRef.current = activeAdapterIds.length > 0 ? activeAdapterIds : defaultAdapterIds;
  }, [activeAdapterIds, defaultAdapterIds]);

  useEffect(() => {
    permissionRef.current = permissionGranted;
  }, [permissionGranted]);

  // 字典热生效：先加载 storage 里的用户覆盖，再订阅后续变化。
  // 扫描到的字段归属哪个槽位是在这里（sidepanel）算的，所以这个上下文必须订阅。
  useEffect(() => {
    void hydrateDictionary();
    return subscribeDictionary(() => {
      setDictionaryRevision((revision) => revision + 1);
    });
  }, []);

  const sendDomAccessUpdate = useCallback((allowed: boolean) => {
    const port = portRef.current;
    if (!port) {
      return;
    }
    try {
      port.postMessage({ kind: 'SET_DOM_ACCESS', allowed });
    } catch (error) {
      console.warn('Failed to update DOM access state.', error);
    }
  }, []);

  const formatFillReason = (reason: string): string => {
    const map: Record<string, string> = {
      'frame-unavailable': t('sidepanel.reason.frameUnavailable'),
      'missing-frame': t('sidepanel.reason.missingFrame'),
      'no-active-tab': t('sidepanel.reason.noActiveTab'),
      'missing-field': t('sidepanel.reason.missingField'),
      'missing-element': t('sidepanel.reason.missingElement'),
      'fill-failed': t('sidepanel.reason.fillFailed'),
      'click-failed': t('sidepanel.reason.clickFailed'),
      'no-selection': t('sidepanel.reason.noSelection'),
      'empty-value': t('sidepanel.reason.emptyValue'),
      'no-permission': t('sidepanel.reason.noPermission'),
      'unsupported-kind': t('sidepanel.reason.unsupportedKind'),
      'no-option-match': t('sidepanel.reason.noOptionMatch'),
      'has-value': t('sidepanel.reason.hasValue'),
      'no-resume-file': t('sidepanel.reason.noResumeFile'),
      'widget-timeout': t('sidepanel.reason.widgetTimeout'),
      'exception': t('sidepanel.reason.exception'),
    };
    return map[reason] ?? reason;
  };

  useEffect(() => {
    let cancelled = false;

    const loadProfiles = async () => {
      setViewState((state) => ({ ...state, loadingProfiles: true, error: undefined }));
      try {
        const result = await listProfiles();
        if (cancelled) {
          return;
        }
        setProfiles(result);
        setViewState({ loadingProfiles: false });
        if (result.length > 0) {
          setSelectedProfileId((current) => current ?? result[0].id);
        } else {
          setSelectedProfileId(null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!cancelled) {
          setViewState({ loadingProfiles: false, error: message });
        }
      }
    };

    loadProfiles().catch(console.error);

    const listener = () => {
      loadProfiles().catch(console.error);
    };

    browser.storage.onChanged.addListener(listener);

    return () => {
      cancelled = true;
      browser.storage.onChanged.removeListener(listener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const settings = await getSettings();
        if (cancelled) return;
        setActiveAdapterIds(settings.adapters.length > 0 ? settings.adapters : defaultAdapterIds);
        fillModeRef.current = settings.fillMode;
      } catch (error) {
        console.warn('Failed to load settings', error);
      }
    };

    loadSettings().catch(console.error);

    const listener = (changes: Record<string, unknown>, area: string) => {
      if (area !== 'local') return;
      if ('settings:app' in changes) {
        loadSettings().catch(console.error);
      }
    };

    browser.storage.onChanged.addListener(listener);
    return () => {
      cancelled = true;
      browser.storage.onChanged.removeListener(listener);
    };
  }, [defaultAdapterIds]);

  useEffect(() => {
    sendDomAccessUpdate(permissionGranted);
    if (!permissionGranted) {
      setFields([]);
      fieldsRef.current = [];
      setSelectedFieldId(null);
      selectedFieldRef.current = null;
      setScanRequestId(null);
      scanRequestIdRef.current = null;
      setScanning(false);
      fillResolversRef.current.clear();
    }
  }, [permissionGranted, sendDomAccessUpdate]);

  useEffect(() => {
    const port = browser.runtime.connect({ name: 'sidepanel' });
    portRef.current = port;

    const handleMessage = (message: unknown) => {
      if (!isRecord(message)) {
        return;
      }
      const permissionEnabled = permissionRef.current;
      if (
        !permissionEnabled &&
        (message.kind === 'GUIDED_CANDIDATE' || message.kind === 'GUIDED_INPUT_CAPTURE' || message.kind === 'FIELDS')
      ) {
        return;
      }

      if (message.kind === 'GUIDED_CANDIDATE') {
        const parsed = parseGuidedCandidateMessage(message);
        if (!parsed) return;
        handleFocusedField(parsed.field, parsed.origin);
        return;
      }

      if (message.kind === 'GUIDED_INPUT_CAPTURE') {
        const parsed = parseGuidedInputCaptureMessage(message);
        if (!parsed) return;
        void handleFieldInputCapture(parsed.field, parsed.value);
        return;
      }

      if (message.kind === 'FIELDS') {
        const parsed = parseFieldsResponse(message);
        if (!parsed) return;
        if (scanRequestIdRef.current && parsed.requestId !== scanRequestIdRef.current) return;

        // Apply heuristics first, then augment with memory preferences
        const initial = buildFieldEntries(
          parsed.fields,
          slotValuesRef.current,
          adapterIdsRef.current,
          customAnswersRef.current,
        );
        // Lazy-load memory and apply preferred slots/values
        void (async () => {
          const { loadMemory, computeSignatureKey } = await import('../../shared/memory/store');
          const memory = await loadMemory();
          const withMemory = initial.map((entry) => {
            const key = computeSignatureKey(entry.field);
            const assoc = memory[key];
            if (!assoc) return entry;
            let next = { ...entry };
            if (assoc.preferredSlot) {
              // If the preferred slot has a value in current profile, use it
              if (isFieldSlotValue(assoc.preferredSlot)) {
                const pref = slotValuesRef.current[assoc.preferredSlot];
                if (pref && pref.trim().length > 0) {
                  next.selectedSlot = assoc.preferredSlot;
                  next.suggestion = pref;
                }
              }
            }
            if (!next.suggestion && assoc.lastValue && assoc.lastValue.trim().length > 0) {
              next.suggestion = assoc.lastValue;
            }
            return {
              ...next,
              manualValue: deriveManualValue(entry, next.suggestion),
            };
          });
          setFields(withMemory);
        })().catch(console.error);

        setScanning(false);
        return;
      }

      if (message.kind === 'FILL_RESULT') {
        const result = parseFillResultMessage(message);
        if (result) {
          handleFillResult(result);
        }
      }
    };

    port.onMessage.addListener(handleMessage);

    port.onDisconnect.addListener(() => {
      portRef.current = null;
      setPermissionGranted(false);
    });

    sendDomAccessUpdate(permissionRef.current);

    return () => {
      port.onMessage.removeListener(handleMessage);
      try {
        port.postMessage({ kind: 'SET_DOM_ACCESS', allowed: false });
      } catch {
        // ignore, port likely disconnected
      }
      port.disconnect();
      portRef.current = null;
    };
  }, [sendDomAccessUpdate]);

  const sendMessage = useCallback(
    (payload: Record<string, unknown>) => {
      if (!permissionGranted) {
        return;
      }
      const port = portRef.current;
      if (!port) {
        return;
      }
      port.postMessage(payload);
    },
    [permissionGranted],
  );

  const notify = useCallback((message: string, tone: 'info' | 'success' | 'error' = 'info') => {
    const colorMap: Record<'info' | 'success' | 'error', 'brand' | 'green' | 'red'> = {
      info: 'brand',
      success: 'green',
      error: 'red',
    };
    notifications.show({
      message,
      color: colorMap[tone],
      autoClose: 2500,
      withCloseButton: true,
    });
  }, []);

  const setFieldStatus = useCallback((fieldId: string, status: FieldStatus, reason?: string) => {
    setFields((current) =>
      current.map((entry) =>
        entry.field.id === fieldId
          ? {
              ...entry,
              status,
              reason,
            }
          : entry,
      ),
    );
  }, []);

  // Auto insights currently disabled while manual review is the primary workflow

  const waitForFillCompletion = useCallback((requestId: string, timeoutMs = 5000) => {
    return new Promise<FillResultMessage | null>((resolve) => {
      const timeout = window.setTimeout(() => {
        fillResolversRef.current.delete(requestId);
        resolve(null);
      }, timeoutMs);
      fillResolversRef.current.set(requestId, (message) => {
        clearTimeout(timeout);
        resolve(message);
      });
    });
  }, []);

  // Auto mode helpers removed

  // Auto mode helpers removed


  const handleAutoFill = useCallback(() => {
    // 附件不参与批量填充：需要用户显式点填，避免一上来就往站点上传简历。
    const targets = fields.filter(
      (entry) =>
        entry.field.kind !== 'file' &&
        entry.suggestion &&
        entry.suggestion.trim().length > 0 &&
        entry.status !== 'pending' &&
        entry.status !== 'filled',
    );
    if (targets.length === 0) {
      notify(t('sidepanel.feedback.noMapped'));
      return;
    }
    const respectEmptyOnly = fillModeRef.current === 'emptyOnly';
    const pendingIds = new Set<string>();
    for (const target of targets) {
      const requestId = crypto.randomUUID();
      pendingIds.add(target.field.id);
      sendMessage({
        kind: 'PROMPT_FILL',
        requestId,
        fieldId: target.field.id,
        frameId: target.field.frameId,
        label: target.field.label,
        mode: 'auto',
        value: target.suggestion ?? '',
        slot: target.selectedSlot ?? target.slot ?? null,
        respectEmptyOnly,
        fieldKind: target.field.kind,
        fieldContext: target.field.context,
        fieldAutocomplete: target.field.autocomplete ?? null,
        fieldRequired: target.field.required,
        profileId: selectedProfile?.id ?? null,
      });
    }
    setFields((current) =>
      current.map((entry) =>
        pendingIds.has(entry.field.id)
          ? {
              ...entry,
              status: 'pending',
              reason: undefined,
            }
          : entry,
      ),
    );
    notify(t('sidepanel.feedback.autofill', targets.length, [String(targets.length)]));
  }, [fields, notify, selectedProfile, sendMessage, t]);

  // Auto mode flow removed

  const requestScan = useCallback(() => {
    if (!permissionGranted) {
      return;
    }
    if (!portRef.current) {
      return;
    }
    const requestId = crypto.randomUUID();
    setScanRequestId(requestId);
    scanRequestIdRef.current = requestId;
    setScanning(true);
    setFields([]);
    nextFocusScrollRef.current = true;
    setSelectedFieldId(null);
    sendMessage({ kind: 'SCAN_FIELDS', requestId });
  }, [permissionGranted, sendMessage]);

  useEffect(() => {
    if (!permissionGranted || !portRef.current) {
      return;
    }
    requestScan();
  }, [permissionGranted, requestScan, selectedProfileId]);

  const handleFillResult = (message: FillResultMessage) => {
    setFields((current) =>
      current.map((entry) => {
        if (entry.field.id !== message.fieldId) {
          return entry;
        }
        const statusMap: Record<string, FieldStatus> = {
          filled: 'filled',
          skipped: 'skipped',
          failed: 'failed',
        };
        const status = statusMap[message.status] ?? 'idle';
        return {
          ...entry,
          status,
          reason: message.reason,
        };
      }),
    );

    const resolver = fillResolversRef.current.get(message.requestId);
    if (resolver) {
      fillResolversRef.current.delete(message.requestId);
      resolver(message);
    }
  };

  const handleSlotSelectionChange = (fieldId: string, slot: PromptOptionSlot | null) => {
    const option = slot ? manualOptions.find((entry) => entry.slot === slot) ?? null : null;
    setFields((current) =>
      current.map((entry) =>
        entry.field.id === fieldId
          ? {
              ...entry,
              selectedSlot: slot,
              suggestion: option ? option.value : entry.suggestion,
              manualValue: option ? option.value : entry.manualValue,
            }
          : entry,
      ),
    );
  };

  const handleManualValueChange = (fieldId: string, value: string) => {
    setFields((current) =>
      current.map((entry) =>
        entry.field.id === fieldId
          ? {
              ...entry,
              manualValue: value,
            }
          : entry,
      ),
    );
  };

  const handleSelectField = (entry: FieldEntry) => {
    nextFocusScrollRef.current = true;
    setSelectedFieldId(entry.field.id);
  };

  const handleReview = (entry: FieldEntry) => {
    if (entry.field.kind === 'file') {
      const source = selectedProfile?.sourceFile;
      if (!selectedProfile || !source) {
        notify(t('sidepanel.feedback.noResumeFile'), 'info');
        return;
      }
      const requestId = crypto.randomUUID();
      void loadFilePayload(selectedProfile.id, source)
        .then((result) => {
          if (!result.ok) {
            notify(
              t(result.reason === 'too-large' ? 'sidepanel.feedback.fileTooLarge' : 'sidepanel.feedback.noResumeFile'),
              result.reason === 'too-large' ? 'error' : 'info',
            );
            return;
          }
          sendMessage({
            kind: 'PROMPT_FILL',
            requestId,
            fieldId: entry.field.id,
            frameId: entry.field.frameId,
            label: entry.field.label,
            mode: 'fill',
            value: source.name,
            preview: source.name,
            slot: null,
            fieldKind: 'file',
            fieldContext: entry.field.context,
            fieldAutocomplete: entry.field.autocomplete ?? null,
            fieldRequired: entry.field.required,
            filePayload: result.payload,
            profileId: selectedProfile.id,
          });
          setFields((current) =>
            current.map((item) =>
              item.field.id === entry.field.id
                ? { ...item, status: 'pending' as FieldStatus, reason: undefined }
                : item,
            ),
          );
        })
        .catch((error: unknown) => {
          console.error('Failed to read resume attachment', error);
          notify(t('sidepanel.feedback.fileReadFailed'), 'error');
        });
      return;
    }

    const { value } = resolveEntryData(entry);
    if (!value) {
      notify(t('sidepanel.feedback.noValues'), 'info');
      return;
    }

    const requestId = crypto.randomUUID();
    sendMessage({
      kind: 'PROMPT_FILL',
      requestId,
      fieldId: entry.field.id,
      frameId: entry.field.frameId,
      label: entry.field.label,
      mode: 'fill',
      value,
      preview: value,
      slot: entry.selectedSlot ?? entry.slot ?? null,
      fieldKind: entry.field.kind,
      fieldContext: entry.field.context,
      fieldAutocomplete: entry.field.autocomplete ?? null,
      fieldRequired: entry.field.required,
      profileId: selectedProfile?.id ?? null,
    });
    setFields((current) =>
      current.map((item) =>
        item.field.id === entry.field.id
          ? {
              ...item,
              status: 'pending',
              reason: undefined,
            }
          : item,
      ),
    );
  };

  const handleCopy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(t('sidepanel.feedback.copied', [label]), 'success');
    } catch (error) {
      console.error('Failed to copy', error);
      notify(t('sidepanel.feedback.noClipboard'), 'error');
    }
  };

  const manualTree = useMemo<ManualValueNode[]>(
    () =>
      buildManualValueTree(selectedProfile, {
        resumeLabel: t('sidepanel.manual.resumeRoot'),
      }),
    [selectedProfile, t],
  );

  const manualOptions = useMemo<PromptOption[]>(
    () =>
      buildProfilePromptOptions(selectedProfile, {
        formatSlotLabel,
        manualTree,
      }),
    [selectedProfile, manualTree],
  );

  const selectedEntry = useMemo(
    () => fields.find((entry) => entry.field.id === selectedFieldId) ?? null,
    [fields, selectedFieldId],
  );

  const resolveEntryData = useCallback(
    (entry: FieldEntry) => {
      if (entry.field.kind === 'file') {
        return {
          selectedOption: null as PromptOption | null,
          fallbackOption: null as PromptOption | null,
          manualValue: '',
          value: '',
        };
      }
      const selectedOption =
        entry.selectedSlot !== null
          ? manualOptions.find((option) => option.slot === entry.selectedSlot) ?? null
          : null;
      const fallbackOption =
        entry.slot !== null
          ? manualOptions.find((option) => option.slot === entry.slot) ?? null
          : null;
      const manualValue = entry.manualValue ?? '';
      const manualValueTrimmed = manualValue.trim();
      const fallbackValue = (selectedOption?.value ?? fallbackOption?.value ?? entry.suggestion ?? '').trim();
      const value = manualValueTrimmed.length > 0 ? manualValueTrimmed : fallbackValue;
      return { selectedOption, fallbackOption, manualValue, value };
    },
    [manualOptions],
  );

  const showPromptOverlay = useCallback(
    (entry: FieldEntry | null, options?: { scrollIntoView?: boolean }) => {
      if (!entry) {
        sendMessage({ kind: 'CLEAR_OVERLAY' });
        return;
      }
      const shouldScroll = options?.scrollIntoView ?? true;

      sendMessage({
        kind: 'HIGHLIGHT_FIELD',
        fieldId: entry.field.id,
        frameId: entry.field.frameId,
        label: '',
        scrollIntoView: shouldScroll,
      });

      if (entry.field.kind === 'file') {
        return;
      }

      const { fallbackOption, manualValue, value } = resolveEntryData(entry);
      const defaultSlot = entry.selectedSlot ?? entry.slot ?? (fallbackOption ? (fallbackOption.slot as PromptOptionSlot | null) : null);
      const defaultValue = manualValue.trim().length > 0 ? manualValue : fallbackOption?.value ?? entry.suggestion ?? '';
      const preview = fallbackOption?.value ?? entry.suggestion ?? value;

      sendMessage({
        kind: 'PROMPT_PREVIEW',
        previewId: `preview:${entry.field.id}`,
        fieldId: entry.field.id,
        frameId: entry.field.frameId,
        label: entry.field.label,
        preview,
        value: defaultValue,
        defaultSlot,
        options: manualOptions,
        profileId: selectedProfileIdValue,
        scrollIntoView: shouldScroll,
        field: {
          id: entry.field.id,
          label: entry.field.label,
          kind: entry.field.kind,
          context: entry.field.context,
          autocomplete: entry.field.autocomplete ?? null,
          required: entry.field.required,
        },
      });
    },
    [manualOptions, resolveEntryData, selectedProfileIdValue, sendMessage],
  );

  const focusField = useCallback(
    (entry: FieldEntry | null, options?: { scrollIntoView?: boolean }) => {
      if (!entry) {
        showPromptOverlay(null);
        return;
      }
      const shouldScroll = options?.scrollIntoView ?? true;
      sendMessage({
        kind: 'FOCUS_FIELD',
        fieldId: entry.field.id,
        frameId: entry.field.frameId,
        scrollIntoView: shouldScroll,
      });
      showPromptOverlay(entry, { scrollIntoView: shouldScroll });
    },
    [sendMessage, showPromptOverlay],
  );

  useEffect(() => {
    if (!selectedEntry) {
      lastFocusedFieldRef.current = null;
      nextFocusScrollRef.current = true;
      return;
    }
    if (lastFocusedFieldRef.current === selectedEntry.field.id) {
      nextFocusScrollRef.current = true;
      return;
    }
    const shouldScroll = nextFocusScrollRef.current;
    nextFocusScrollRef.current = true;
    focusField(selectedEntry, { scrollIntoView: shouldScroll });
    lastFocusedFieldRef.current = selectedEntry.field.id;
  }, [focusField, selectedEntry]);

  async function handleFieldInputCapture(field: ScannedField, value: string): Promise<void> {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }
    const entry = ensureFieldEntry(field);
    nextFocusScrollRef.current = false;
    setSelectedFieldId(field.id);
    setFields((current) => {
      const next = current.map((item) =>
        item.field.id === field.id
          ? {
              ...item,
              field,
              suggestion: normalized,
              manualValue: normalized,
              status: 'filled' as FieldStatus,
              reason: undefined,
            }
          : item,
      );
      fieldsRef.current = next;
      return next;
    });
    const updatedEntry = fieldsRef.current.find((item) => item.field.id === field.id);
    if (updatedEntry) {
      showPromptOverlay(updatedEntry, { scrollIntoView: false });
    }
    try {
      const { learnAccept } = await import('../../shared/memory/store');
      await learnAccept(field, { slot: entry.selectedSlot ?? entry.slot, value: normalized });
    } catch (error) {
      console.warn('Failed to learn from input capture', error);
    }
  }

  function handleFocusedField(field: ScannedField, origin: 'focus' | 'step' | 'request'): void {
    const entry = ensureFieldEntry(field);
    nextFocusScrollRef.current = origin !== 'focus';
    setSelectedFieldId(field.id);
    showPromptOverlay(entry, { scrollIntoView: origin !== 'focus' });
  }

  const openProfilesPage = () => {
    browser.tabs
      .create({ url: browser.runtime.getURL('/options.html') })
      .catch((error: unknown) => {
        console.warn('Unable to open options page.', error);
    });
  };

  const handlePermissionAccept = useCallback(() => {
    setPermissionGranted(true);
  }, []);

  const handlePermissionRevoke = useCallback(() => {
    sendMessage({ kind: 'CLEAR_OVERLAY' });
    setPermissionGranted(false);
  }, [sendMessage]);

  const profileOptions = useMemo(
    () =>
      profiles.map((profile) => ({
        value: profile.id,
        label: formatProfileLabel(profile),
      })),
    [profiles],
  );

  const fillDisabled =
    fields.length === 0 ||
    fields.every(
      (entry) =>
        entry.field.kind === 'file' ||
        !entry.suggestion ||
        entry.suggestion.trim().length === 0 ||
        entry.status === 'pending' ||
        entry.status === 'filled',
    );

  const renderDomToolbar = () => {
    const iconSize = 18;
    const baseDisabled = viewState.loadingProfiles || !selectedProfile || !permissionGranted;
    const statusBadge = scanning
      ? { color: 'brand' as const, label: t('sidepanel.toolbar.scanning') }
      : null;

    const renderIconButton = (
      label: string,
      options: {
        onClick: () => void;
        disabled?: boolean;
        color?: string;
        variant?: 'subtle' | 'light' | 'filled';
        icon: JSX.Element;
      },
    ) => (
      <Tooltip key={label} label={label} withArrow>
        <ActionIcon
          aria-label={label}
          onClick={options.onClick}
          disabled={baseDisabled || options.disabled}
          variant={options.variant ?? 'light'}
          color={options.color ?? 'gray'}
          radius="md"
          size="lg"
        >
          {options.icon}
        </ActionIcon>
      </Tooltip>
    );

    return (
      <Group justify="space-between" align="center" gap="xs" wrap="wrap">
        <Group gap="xs" wrap="wrap">
          {renderIconButton(scanning ? t('sidepanel.toolbar.scanning') : t('sidepanel.toolbar.rescan'), {
            onClick: requestScan,
            disabled: scanning,
            color: 'brand',
            variant: scanning ? 'filled' : 'light',
            icon: <RefreshCcw size={iconSize} />,
          })}
          {renderIconButton(t('sidepanel.toolbar.fillMapped'), {
            onClick: handleAutoFill,
            disabled: fillDisabled,
            color: 'brand',
            variant: 'filled',
            icon: <Sparkles size={iconSize} />,
          })}
          {renderIconButton(t('sidepanel.toolbar.clearOverlay'), {
            onClick: () => sendMessage({ kind: 'CLEAR_OVERLAY' }),
            color: 'gray',
            variant: 'subtle',
            icon: <Eraser size={iconSize} />,
          })}
        </Group>
        <Group gap="xs" align="center">
          {statusBadge && (
            <Badge color={statusBadge.color} variant="light" size="sm">
              {statusBadge.label}
            </Badge>
          )}
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            onClick={handlePermissionRevoke}
            aria-label={tLoose('sidepanel.permission.revoke')}
          >
            {tLoose('sidepanel.permission.revoke')}
          </Button>
        </Group>
      </Group>
    );
  };

  return (
    <Box style={{ position: 'relative', height: '100vh' }}>
      <Stack gap={0} style={{ height: '100%' }}>
        <Stack gap={0} style={{ flex: 1, overflow: 'hidden' }}>
          <Paper px="md" py="sm" withBorder={false} style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
            <Group gap="xs" wrap="nowrap" align="flex-end">
              <Select
                label={t('popup.title')}
                placeholder={t('popup.overlay.profileSelectPlaceholder')}
                description={
                  profiles.length > 0
                    ? t('popup.overlay.profileSelectDescription')
                    : t('popup.overlay.profileSelectEmpty')
                }
                data={profileOptions}
                value={selectedProfileId}
                onChange={(value) => setSelectedProfileId(value ?? null)}
                clearable
                disabled={profiles.length === 0}
                size="sm"
                style={{ flex: 1 }}
              />
              <Tooltip label={t('sidepanel.toolbar.manageProfiles')} withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  radius="md"
                  onClick={openProfilesPage}
                  aria-label={t('sidepanel.toolbar.manageProfiles')}
                >
                  <Users size={18} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Paper>
          <Tabs
            value={mode}
            onChange={(value) => setMode((value as PanelMode) ?? 'dom')}
            keepMounted={false}
            variant="outline"
            radius="md"
            style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <Tabs.List>
              <Tabs.Tab value="dom">{t('sidepanel.tabs.dom')}</Tabs.Tab>
              <Tabs.Tab value="manual">{t('sidepanel.tabs.manual')}</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel
              value="dom"
              style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            >
              <FieldReviewMode
                viewState={viewState}
                selectedProfile={selectedProfile}
                permissionGranted={permissionGranted}
                onAllowPermission={handlePermissionAccept}
                scanning={scanning}
                fields={fields}
                selectedFieldId={selectedFieldId}
                toolbar={renderDomToolbar()}
                footer={renderSelectionFooter()}
                renderFieldCard={(entry, options) => renderFieldCard(entry, options)}
                t={t}
              />
            </Tabs.Panel>
            <Tabs.Panel value="manual" style={{ flex: 1, overflow: 'hidden' }}>
              <ManualCopyMode
                viewState={viewState}
                selectedProfile={selectedProfile}
                manualTree={manualTree}
                onCopy={handleCopy}
                t={t}
              />
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Stack>
    </Box>
  );

  function ensureFieldEntry(field: ScannedField): FieldEntry {
    const existingIndex = fieldsRef.current.findIndex((entry) => entry.field.id === field.id);
    if (existingIndex >= 0) {
      const updated: FieldEntry = { ...fieldsRef.current[existingIndex], field };
      const next = [...fieldsRef.current];
      next[existingIndex] = updated;
      fieldsRef.current = next;
      setFields(next);
      return updated;
    }
    const [created] = buildFieldEntries(
      [field],
      slotValuesRef.current,
      adapterIdsRef.current,
      customAnswersRef.current,
    );
    const next = [...fieldsRef.current, created];
    fieldsRef.current = next;
    setFields(next);
    return created;
  }

  function renderFieldCard(entry: FieldEntry, options: { isSelected?: boolean } = {}) {
    const { selectedOption, value } = resolveEntryData(entry);
    const baseSlotLabel = entry.slot
      ? formatSlotLabel(entry.slot)
      : entry.slotSource === 'custom'
        ? t('sidepanel.field.customAnswer')
        : t('sidepanel.field.unmapped');
    const slotLabel = baseSlotLabel;
    const summary = (() => {
      if (entry.field.kind === 'file') {
        return t('sidepanel.field.fileSummary');
      }
      if (selectedOption) {
        return t('sidepanel.field.selectedValue', [truncate(selectedOption.value)]);
      }
      if (value) {
        return entry.slotSource === 'custom'
          ? t('sidepanel.field.suggestedCustom', [truncate(value)])
          : t('sidepanel.field.suggestedProfile', [truncate(value)]);
      }
      return manualOptions.length > 0 ? t('sidepanel.field.chooseValue') : t('sidepanel.field.noValues');
    })();

    const autoInfo: string[] = [];
    const autoConfidencePercent =
      typeof entry.autoConfidence === 'number' ? Math.round(entry.autoConfidence * 100) : null;
    if (entry.autoKeyLabel) {
      autoInfo.push(
        autoConfidencePercent !== null
          ? t('sidepanel.field.autoKeyWithConfidence', [entry.autoKeyLabel, String(autoConfidencePercent)])
          : t('sidepanel.field.autoKey', [entry.autoKeyLabel]),
      );
    }
    if (entry.autoNote) {
      autoInfo.push(t('sidepanel.field.autoReason', [entry.autoNote]));
    }

    const isSelected = options.isSelected ?? false;
    const statusColor =
      entry.status === 'filled'
        ? 'green'
        : entry.status === 'failed'
          ? 'red'
          : entry.status === 'pending'
            ? 'brand'
            : 'gray';

    return (
      <Card
        key={entry.field.id}
        withBorder
        radius="md"
        p="sm"
        shadow={isSelected ? 'sm' : 'xs'}
        role="button"
        tabIndex={0}
        onClick={() => handleSelectField(entry)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleSelectField(entry);
          }
        }}
        style={{
          cursor: 'pointer',
          borderColor: isSelected ? 'var(--mantine-color-brand-5)' : undefined,
          backgroundColor: isSelected ? 'rgba(137, 100, 89, 0.08)' : undefined,
          outline: 'none',
        }}
      >
        <Stack gap="xs">
          <Group justify="space-between" align="flex-start">
            <Stack gap={4} flex={1}>
              <Text fw={600} fz="sm">
                {entry.field.label || t('sidepanel.field.noLabel')}
                {entry.field.required ? ' *' : ''}
              </Text>
              <Text fz="xs" c="dimmed">
                {t('sidepanel.field.meta', [
                  t(`sidepanel.fieldKind.${entry.field.kind}`),
                  slotLabel,
                  String(entry.field.frameId),
                ])}
              </Text>
              <Text fz="xs" c="dimmed">
                {summary}
              </Text>
            </Stack>
            {entry.status !== 'idle' && (
              <Badge color={statusColor} variant="light" size="sm">
                {t(`sidepanel.status.${entry.status}`)}
              </Badge>
            )}
          </Group>
          {entry.reason && (
            <Text fz="xs" c="dimmed">
              {formatFillReason(entry.reason)}
            </Text>
          )}
          {autoInfo.map((line) => (
            <Text key={line} fz="xs" c="dimmed">
              {line}
            </Text>
          ))}
        </Stack>
      </Card>
    );
  }

  function renderSelectionFooter() {
    if (viewState.loadingProfiles) {
      return (
        <Text fz="sm" c="dimmed">
          {t('sidepanel.states.loadingProfiles')}
        </Text>
      );
    }
    if (viewState.error) {
      return (
        <Text fz="sm" c="red">
          {t('sidepanel.states.error', [viewState.error])}
        </Text>
      );
    }
    if (!selectedEntry) {
      const baseMessage =
        scanning && fields.length === 0
          ? t('sidepanel.toolbar.scanning')
          : fields.length === 0
            ? t('sidepanel.states.noFields')
            : t('sidepanel.footer.noSelection');
      return (
        <Text fz="sm" c="dimmed">
          {baseMessage}
        </Text>
      );
    }

    if (selectedEntry.field.kind === 'file') {
      return (
        <Group justify="space-between" align="center">
          <Stack gap="xs">
            <Text fw={600} fz="sm">
              {selectedEntry.field.label || t('sidepanel.field.noLabel')}
              {selectedEntry.field.required ? ' *' : ''}
            </Text>
            <Text fz="xs" c="dimmed">
              {t('sidepanel.preview.file')}
            </Text>
          </Stack>
          <Button
            size="sm"
            variant="light"
            onClick={() => handleReview(selectedEntry)}
            disabled={selectedEntry.status === 'pending'}
          >
            {t('sidepanel.buttons.openPicker')}
          </Button>
        </Group>
      );
    }

    const { fallbackOption, manualValue, value } = resolveEntryData(selectedEntry);
    const currentSlot =
      selectedEntry.selectedSlot ??
      (fallbackOption ? (fallbackOption.slot as PromptOptionSlot | null) : null);
    const fillDisabled = selectedEntry.status === 'pending' || !value;
    const placeholderKey = fallbackOption
      ? 'sidepanel.guided.manualInputPlaceholderWithValue'
      : 'sidepanel.guided.manualInputPlaceholder';
    const defaultSlot = fallbackOption ? (fallbackOption.slot as PromptOptionSlot | null) : undefined;

    return (
      <Stack gap="sm">
        <Stack gap={4}>
          <Text fw={600} fz="sm">
            {selectedEntry.field.label || t('sidepanel.field.noLabel')}
            {selectedEntry.field.required ? ' *' : ''}
          </Text>
          <Text fz="xs" c="dimmed">
            {t('sidepanel.footer.selectionHint')}
          </Text>
        </Stack>
        <PromptEditor
          options={manualOptions}
          defaultSlot={defaultSlot}
          defaultValue={fallbackOption?.value}
          preview={selectedEntry.suggestion ?? undefined}
          value={manualValue}
          selectedSlot={currentSlot ?? null}
          onValueChange={(next) => handleManualValueChange(selectedEntry.field.id, next)}
          onSlotChange={(slot) => handleSlotSelectionChange(selectedEntry.field.id, slot)}
        >
          {(editor) => (
            <>
              <Select
                label={t('sidepanel.field.selectorLabel')}
                placeholder={t('sidepanel.field.selectPlaceholder')}
                data={editor.options.map((option) => ({
                  value: option.slot,
                  label: `${option.label} · ${truncate(option.value)}`,
                }))}
                value={editor.selectedSlot ?? null}
                onChange={(slot) => editor.setSelectedSlot(slot ? (slot as PromptOptionSlot) : null)}
                size="sm"
                clearable
                searchable={editor.options.length > 7}
                comboboxProps={{ withinPortal: true }}
              />
              <Textarea
                label={t('sidepanel.guided.manualInputLabel')}
                placeholder={t(placeholderKey)}
                autosize
                minRows={2}
                maxRows={6}
                value={editor.value}
                onChange={(event) => editor.setValue(event.currentTarget.value)}
                description={t('sidepanel.guided.manualInputHint')}
              />
            </>
          )}
        </PromptEditor>
        <Group justify="flex-end">
          <Button size="sm" disabled={fillDisabled} onClick={() => handleReview(selectedEntry)}>
            {t('sidepanel.buttons.fillField')}
          </Button>
        </Group>
      </Stack>
    );
  }
}

function buildFieldEntries(
  fields: ScannedField[],
  slots: SlotValueMap,
  adapters: string[],
  customAnswers: Record<string, string> = {},
): FieldEntry[] {
  return fields.map((field) => {
    const slot = resolveFieldSlot(field, adapters);
    const slotSuggestion = slot ? slots[slot] : undefined;
    // 没匹配到 slot 时，用页面标签去 custom（「问题 -> 答案」）表兜底。
    const customSuggestion = slotSuggestion
      ? undefined
      : matchCustomAnswer(field.label, field.context, customAnswers);
    const suggestion = slotSuggestion ?? customSuggestion;
    return {
      field,
      slot,
      selectedSlot: slotSuggestion ? slot : null,
      suggestion,
      manualValue: suggestion ?? '',
      status: 'idle',
      reason: undefined,
      slotSource: slot ? 'heuristic' : customSuggestion ? 'custom' : 'unset',
      autoKey: undefined,
      autoKeyLabel: undefined,
      autoNote: undefined,
      autoConfidence: undefined,
    };
  });

}

function deriveManualValue(entry: FieldEntry, nextSuggestion?: string | null): string {
  const currentManual = entry.manualValue ?? '';
  const previousSuggestion = entry.suggestion ?? '';
  const trimmedManual = currentManual.trim();
  const trimmedPreviousSuggestion = previousSuggestion.trim();
  if (!trimmedManual || trimmedManual === trimmedPreviousSuggestion) {
    return nextSuggestion ?? '';
  }
  return currentManual;
}

function formatProfileLabel(profile: ProfileRecord): string {
  // 方案名优先（如「算法岗」），其次本人姓名
  const name =
    profile.name?.trim() ||
    profile.basic?.name?.trim() ||
    i18n.t('sidepanel.profile.unnamed');
  const created = new Date(profile.createdAt).toLocaleDateString();
  return i18n.t('sidepanel.profile.label', [name, created]);
}

function truncate(value: string, limit = 120): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function parseFieldsResponse(value: Record<string, unknown>): { requestId: string; fields: ScannedField[] } | null {
  if (typeof value.requestId !== 'string' || !Array.isArray(value.fields)) {
    return null;
  }
  return {
    requestId: value.requestId,
    fields: value.fields as ScannedField[],
  };
}

function isScannedField(value: unknown): value is ScannedField {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.kind === 'string' && typeof record.label === 'string';
}

function parseGuidedCandidateMessage(
  value: Record<string, unknown>,
): { field: ScannedField; origin: 'focus' | 'step' | 'request' } | null {
  if (!isScannedField(value.field)) {
    return null;
  }
  const originValue = typeof value.origin === 'string' ? value.origin : 'focus';
  const origin: 'focus' | 'step' | 'request' =
    originValue === 'step' ? 'step' : originValue === 'request' ? 'request' : 'focus';
  return {
    field: value.field,
    origin,
  };
}

function parseGuidedInputCaptureMessage(
  value: Record<string, unknown>,
): { field: ScannedField; value: string } | null {
  if (!isScannedField(value.field) || typeof value.value !== 'string') {
    return null;
  }
  return {
    field: value.field,
    value: value.value,
  };
}


function parseFillResultMessage(value: Record<string, unknown>): FillResultMessage | null {
  if (
    typeof value.requestId !== 'string' ||
    typeof value.fieldId !== 'string' ||
    typeof value.frameId !== 'number' ||
    !isFillResultStatus(value.status)
  ) {
    return null;
  }
  return {
    requestId: value.requestId,
    fieldId: value.fieldId,
    frameId: value.frameId,
    status: value.status,
    reason: typeof value.reason === 'string' ? value.reason : undefined,
  };
}

function isFillResultStatus(value: unknown): value is FillResultMessage['status'] {
  return value === 'filled' || value === 'skipped' || value === 'failed';
}

/** 附件上限：base64 之后消息体约为 1.37 倍，再大就不适合走消息通道了。 */
const MAX_RESUME_BYTES = 8 * 1024 * 1024;

type FilePayloadResult =
  | { ok: true; payload: FillFilePayload }
  | { ok: false; reason: 'missing' | 'too-large' };

/**
 * 把当前方案的简历附件读成 base64 载荷。
 * 侧边栏是扩展页面，能直接读 IndexedDB；content script 读不到扩展源的存储。
 */
async function loadFilePayload(
  profileId: string,
  source: StoredFileReference,
): Promise<FilePayloadResult> {
  if (source.size > MAX_RESUME_BYTES) {
    return { ok: false, reason: 'too-large' };
  }
  const buffer = await getFileBuffer(profileId);
  if (!buffer || buffer.byteLength === 0) {
    return { ok: false, reason: 'missing' };
  }
  if (buffer.byteLength > MAX_RESUME_BYTES) {
    return { ok: false, reason: 'too-large' };
  }
  return {
    ok: true,
    payload: {
      name: source.name || 'resume.pdf',
      type: source.type || 'application/pdf',
      base64: arrayBufferToBase64(buffer),
    },
  };
}
