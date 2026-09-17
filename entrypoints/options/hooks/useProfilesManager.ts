import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import type { UseFormReturn } from 'react-hook-form';
import { createDeepSeekProvider, isAiConfigured } from '../../../shared/storage/settings';
import { ResumeParseError, parseResumeWithAi } from '../../../shared/llm/resumeParse';
import { ProviderConfigurationError, ProviderInvocationError } from '../../../shared/llm/errors';
import { extractTextFromPdf } from '../../../shared/pdf/extractText';
import { extractResumeFromText } from '../../../shared/pdf/ruleExtract';
import { deleteProfile, listProfiles, saveProfile, storeFile } from '../../../shared/storage/profiles';
import { getActiveProfileId, setActiveProfileId } from '../../../shared/storage/activeProfile';
import {
  cnProfileFieldsFromResume,
  mergeCnProfileData,
  resumeFromCnProfile,
} from '../../../shared/schema/cnProfileBridge';
import { createEmptyProfile, type CnProfileData } from '../../../shared/schema/cnProfile';
import { validateResume } from '../../../shared/validate';
import type { ProviderSnapshot, ProfileRecord } from '../../../shared/types';
import {
  createEmptyResumeFormValues,
  formValuesToResume,
  mergeResumeFormValues,
  resumeToFormValues,
  type ResumeFormValues,
} from '../components/ProfileForm';
import type { ProfilesCardProfile } from '../components/ProfilesCard';
import type { DeepSeekConfigState } from './useSettings';
import {
  formatProfileParsing,
  formatProfileSummary,
  resolveProfileName,
} from './profileUtils';

export type StatusPhase = 'idle' | 'extracting' | 'parsing' | 'saving' | 'complete' | 'error';

export interface StatusState {
  phase: StatusPhase;
  message: string;
}

/** 导入 PDF 的三种处理方式：规则解析（零 AI）/ AI 解析 / 仅存文件。 */
export type FileImportMode = 'parse' | 'rule' | 'store';

type BusyAction = 'upload' | 'parse' | 'save' | null;

interface ProfilesState {
  loading: boolean;
  error?: string;
}

interface UseProfilesManagerParams {
  form: UseFormReturn<ResumeFormValues>;
  /** 只在「AI 解析」这一条路径上用到。填表链路从不读它。 */
  deepSeekConfig: DeepSeekConfigState;
  t: (key: string, substitutions?: unknown) => string;
}

interface UseProfilesManagerResult {
  profiles: ProfileRecord[];
  profilesState: ProfilesState;
  profilesData: ProfilesCardProfile[];
  selectedProfile: ProfileRecord | null;
  refreshProfiles: (preferredId?: string) => Promise<void>;
  validationErrors: string[];
  status: StatusState;
  errorDetails: string | null;
  busy: boolean;
  busyAction: BusyAction;
  rawText: string;
  filePromptOpen: boolean;
  parseAgainConfirmOpen: boolean;
  fileSummary: string | null;
  rawSummary: string | null;
  formSaving: boolean;
  canParseAgain: boolean;
  profilesErrorLabel?: string;
  handleSaveForm: (values: ResumeFormValues) => Promise<void>;
  handleResetForm: () => void;
  handleSelectProfile: (id: string) => void;
  handleDeleteProfile: (id: string) => Promise<void>;
  handleCreateProfile: () => Promise<void>;
  handleFileSelect: (file: File | null) => void;
  handleFileAction: (mode: FileImportMode) => Promise<void>;
  closeFilePrompt: () => void;
  openParseAgainConfirm: () => void;
  closeParseAgainConfirm: () => void;
  handleParseAgain: () => Promise<void>;
}

export function useProfilesManager({
  form,
  deepSeekConfig,
  t,
}: UseProfilesManagerParams): UseProfilesManagerResult {
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [profilesState, setProfilesState] = useState<ProfilesState>({ loading: true });
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const selectedProfileIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<StatusState>({ phase: 'idle', message: '' });
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [rawText, setRawText] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [filePromptOpen, setFilePromptOpen] = useState(false);
  const [parseAgainConfirmOpen, setParseAgainConfirmOpen] = useState(false);

  useEffect(() => {
    selectedProfileIdRef.current = selectedProfileId;
  }, [selectedProfileId]);

  const refreshProfiles = useCallback(
    async (preferredId?: string) => {
      setProfilesState((state) => ({ ...state, loading: true, error: undefined }));
      try {
        const list = await listProfiles();
        setProfiles(list);
        setProfilesState({ loading: false });
        const storedActiveId = await getActiveProfileId();
        const availableIds = new Set(list.map((profile) => profile.id));
        const currentSelected = selectedProfileIdRef.current;
        let nextSelected: string | null = null;
        if (preferredId && availableIds.has(preferredId)) {
          nextSelected = preferredId;
        } else if (storedActiveId && availableIds.has(storedActiveId)) {
          nextSelected = storedActiveId;
        } else if (currentSelected && availableIds.has(currentSelected)) {
          nextSelected = currentSelected;
        } else {
          nextSelected = list.length > 0 ? list[0].id : null;
        }
        setSelectedProfileId(nextSelected);
        if (nextSelected !== storedActiveId) {
          try {
            await setActiveProfileId(nextSelected);
          } catch (error: unknown) {
            console.warn('Unable to persist active profile', error);
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        setProfilesState({ loading: false, error: message });
      }
    },
    [],
  );

  useEffect(() => {
    void refreshProfiles();
    const listener = () => {
      void refreshProfiles();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [refreshProfiles]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const validationErrors = useMemo(() => {
    if (!selectedProfile?.validation || selectedProfile.validation.valid) {
      return [];
    }
    return selectedProfile.validation.errors ?? [];
  }, [selectedProfile]);

  useEffect(() => {
    if (!selectedProfile) {
      const empty = createEmptyResumeFormValues();
      form.reset(empty);
      setRawText('');
      return;
    }
    const values = resumeToFormValues(resumeFromCnProfile(selectedProfile));
    form.reset(values);
    setRawText(selectedProfile.rawText ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfile]);

  const handleFileSelect = useCallback(
    (file: File | null) => {
      if (!selectedProfile || !file) {
        return;
      }
      setPendingFile(file);
      setFilePromptOpen(true);
    },
    [selectedProfile],
  );

  const closeFilePrompt = useCallback(() => {
    setFilePromptOpen(false);
    setPendingFile(null);
  }, []);

  /**
   * 「规则解析 / AI 解析」共用的落库收尾。
   *
   * 两条路径的差别只在**怎么得到数据**：规则路径产出 JSON Resume 再经 bridge
   * 转成扁平档案（有损，但正则本来也只能抽到表层字段）；AI 路径直接产出扁平
   * 档案，因此绕过 bridge，中文专有字段（民族/政治面貌/身份证/籍贯/紧急联系人/
   * 英语水平/排名/培养方式/实习时长/研究方向）能被无损写入。
   */
  const applyParsedData = useCallback(
    async (params: {
      profile: ProfileRecord;
      text: string;
      fileRef: ProfileRecord['sourceFile'];
      formValues: ResumeFormValues;
      patch: Partial<CnProfileData>;
      /** 规则抽取不改写 provider，所以这里可能是 undefined。 */
      provider: ProviderSnapshot | undefined;
      parsedAt: string;
    }) => {
      const { profile, text, fileRef, formValues, patch, provider, parsedAt } = params;
      const mergedValues = mergeResumeFormValues(form.getValues(), formValues);
      form.reset(mergedValues);

      const mergedResume = formValuesToResume(mergedValues);
      const validationResult = validateResume(mergedResume);

      const updated: ProfileRecord = {
        ...profile,
        // merge 而不是整组覆盖：bridge 对「表单不拥有的字段」只能吐 undefined，
        // 直接展开会把民族 / 政治面貌 / 身份证号 等清空。
        ...mergeCnProfileData(profile, patch),
        sourceFile: fileRef,
        rawText: text,
        provider,
        parsedAt,
        validation: {
          valid: validationResult.valid,
          errors: validationResult.errors,
        },
      };

      await saveProfile(updated);
      await refreshProfiles(updated.id);
      setRawText(text);
      return updated;
    },
    [form, refreshProfiles],
  );

  const processFile = useCallback(
    async (file: File, mode: FileImportMode) => {
      if (!selectedProfile) {
        return;
      }
      setBusy(true);
      setBusyAction(mode === 'parse' ? 'parse' : 'upload');
      setErrorDetails(null);
      setStatus({ phase: 'extracting', message: t('options.profileForm.status.extracting') });

      try {
        const { text } = await extractTextFromPdf(file);

        if (!text.trim()) {
          throw new Error(t('onboarding.errors.noText'));
        }

        const fileRef = await storeFile(selectedProfile.id, file);
        const parseRequested = mode === 'parse';
        const ruleRequested = mode === 'rule';

        if (ruleRequested) {
          // 零 AI 路径：纯正则 + 章节切分，随时可用，不依赖任何模型。
          setStatus({ phase: 'parsing', message: t('options.profileForm.status.ruleExtracting') });
          try {
            const outcome = extractResumeFromText(text);
            const parsedResume = outcome.resume;
            await applyParsedData({
              profile: selectedProfile,
              text,
              fileRef,
              formValues: resumeToFormValues(parsedResume),
              patch: cnProfileFieldsFromResume(parsedResume),
              // 规则抽取不改写 provider：它不是 AI 产物，保持用户原有配置不变。
              provider: selectedProfile.provider,
              parsedAt: new Date().toISOString(),
            });
            setStatus({ phase: 'complete', message: t('options.profileForm.status.ruleParsed') });
            setErrorDetails(null);
          } catch (error: unknown) {
            setStatus({ phase: 'error', message: t('options.profileForm.status.ruleFailed') });
            setErrorDetails(error instanceof Error ? error.message : String(error));
          }
          return;
        }

        if (parseRequested) {
          if (!isAiConfigured(createDeepSeekProvider(deepSeekConfig.apiKey, deepSeekConfig.model, deepSeekConfig.apiBaseUrl))) {
            setStatus({ phase: 'error', message: t('options.aiParse.notConfigured') });
            setErrorDetails(null);
            // 文件仍旧存下来，用户可以稍后配置好密钥再解析。
            await saveProfile({
              ...selectedProfile,
              sourceFile: fileRef,
              rawText: text,
            });
            await refreshProfiles(selectedProfile.id);
            setRawText(text);
            return;
          }

          setStatus({ phase: 'parsing', message: t('options.profileForm.status.parsing') });
          try {
            const provider = createDeepSeekProvider(
              deepSeekConfig.apiKey,
              deepSeekConfig.model,
              deepSeekConfig.apiBaseUrl,
            );
            const outcome = await parseResumeWithAi(provider, text);

            // 表单只负责显示它能显示的字段；AI 抽到的中文专有字段由 patch 直接落库。
            const mergedProfileData = mergeCnProfileData(selectedProfile, outcome.data);
            const previewProfile: ProfileRecord = { ...selectedProfile, ...mergedProfileData };

            await applyParsedData({
              profile: selectedProfile,
              text,
              fileRef,
              formValues: resumeToFormValues(resumeFromCnProfile(previewProfile)),
              patch: outcome.data,
              provider: {
                kind: 'deepseek',
                model: provider.model,
                apiBaseUrl: provider.apiBaseUrl,
              },
              parsedAt: new Date().toISOString(),
            });

            setStatus({
              phase: 'complete',
              message: outcome.repaired
                ? t('options.profileForm.status.parsedRepaired')
                : t('options.profileForm.status.parsed'),
            });
            setErrorDetails(null);
          } catch (error: unknown) {
            setStatus({ phase: 'error', message: describeParseError(error, t) });
            setErrorDetails(null);
          }
          return;
        }

        // 第三条路：只保存文件与文本，不做任何抽取。
        setStatus({ phase: 'saving', message: t('options.profileForm.status.savingUpload') });
        const updated: ProfileRecord = {
          ...selectedProfile,
          sourceFile: fileRef,
          rawText: text,
        };
        await saveProfile(updated);
        await refreshProfiles(updated.id);
        setRawText(text);
        setStatus({ phase: 'complete', message: t('options.profileForm.status.stored') });
        setErrorDetails(null);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus({ phase: 'error', message: t('options.profileForm.status.uploadFailed') });
        setErrorDetails(message);
        console.error(error);
      } finally {
        setBusy(false);
        setBusyAction(null);
      }
    },
    [applyParsedData, deepSeekConfig, form, refreshProfiles, selectedProfile, t],
  );

  const handleFileAction = useCallback(
    async (mode: FileImportMode) => {
      if (!pendingFile) {
        return;
      }
      await processFile(pendingFile, mode);
      closeFilePrompt();
    },
    [closeFilePrompt, pendingFile, processFile],
  );

  const openParseAgainConfirm = useCallback(() => {
    setParseAgainConfirmOpen(true);
  }, []);

  const closeParseAgainConfirm = useCallback(() => {
    setParseAgainConfirmOpen(false);
  }, []);

  /** 用已保存的原始文本再跑一次 AI 解析（不重新上传 PDF）。 */
  const handleParseAgain = useCallback(async () => {
    if (!selectedProfile || busy) {
      return;
    }
    closeParseAgainConfirm();
    const text = rawText.trim();
    if (!text) {
      return;
    }

    const provider = createDeepSeekProvider(
      deepSeekConfig.apiKey,
      deepSeekConfig.model,
      deepSeekConfig.apiBaseUrl,
    );
    if (!isAiConfigured(provider)) {
      setStatus({ phase: 'error', message: t('options.aiParse.notConfigured') });
      setErrorDetails(null);
      return;
    }

    setBusy(true);
    setBusyAction('parse');
    setErrorDetails(null);
    setStatus({ phase: 'parsing', message: t('options.profileForm.status.parsing') });

    try {
      const outcome = await parseResumeWithAi(provider, text);
      const mergedProfileData = mergeCnProfileData(selectedProfile, outcome.data);
      const previewProfile: ProfileRecord = { ...selectedProfile, ...mergedProfileData };

      await applyParsedData({
        profile: selectedProfile,
        text,
        fileRef: selectedProfile.sourceFile,
        formValues: resumeToFormValues(resumeFromCnProfile(previewProfile)),
        patch: outcome.data,
        provider: {
          kind: 'deepseek',
          model: provider.model,
          apiBaseUrl: provider.apiBaseUrl,
        },
        parsedAt: new Date().toISOString(),
      });

      setStatus({
        phase: 'complete',
        message: outcome.repaired
          ? t('options.profileForm.status.parsedRepaired')
          : t('options.profileForm.status.parsed'),
      });
      setErrorDetails(null);
    } catch (error: unknown) {
      setStatus({ phase: 'error', message: describeParseError(error, t) });
      setErrorDetails(null);
      console.error(error);
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [applyParsedData, busy, closeParseAgainConfirm, deepSeekConfig, rawText, selectedProfile, t]);

  const handleSaveForm = useCallback(
    async (values: ResumeFormValues) => {
      if (!selectedProfile) {
        return;
      }
      setBusy(true);
      setBusyAction('save');
      setStatus({ phase: 'saving', message: t('options.profileForm.status.savingForm') });
      setErrorDetails(null);

      try {
        const resumeData = formValuesToResume(values);
        const hasResume = Object.keys(resumeData).length > 0;
        const resumePayload = hasResume ? resumeData : undefined;
        const validationResult = resumePayload ? validateResume(resumePayload) : undefined;

        const updated: ProfileRecord = {
          ...selectedProfile,
          ...(resumePayload
            ? mergeCnProfileData(selectedProfile, cnProfileFieldsFromResume(resumePayload))
            : {}),
          parsedAt: resumePayload ? new Date().toISOString() : undefined,
          validation: resumePayload
            ? {
                valid: validationResult?.valid ?? true,
                errors: validationResult?.errors,
              }
            : undefined,
        };

        await saveProfile(updated);
        await refreshProfiles(updated.id);
        setStatus({ phase: 'complete', message: t('options.profileForm.status.saved') });
        setErrorDetails(null);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus({ phase: 'error', message: t('options.profileForm.status.saveFailed') });
        setErrorDetails(message);
        console.error(error);
      } finally {
        setBusy(false);
        setBusyAction(null);
      }
    },
    [refreshProfiles, selectedProfile, t],
  );

  const handleResetForm = useCallback(() => {
    if (!selectedProfile) {
      const empty = createEmptyResumeFormValues();
      form.reset(empty);
      return;
    }
    const values = resumeToFormValues(resumeFromCnProfile(selectedProfile));
    form.reset(values);
  }, [form, selectedProfile]);

  const handleSelectProfile = useCallback(
    (id: string) => {
      setSelectedProfileId(id);
      void setActiveProfileId(id).catch((error) => {
        console.warn('Unable to persist active profile', error);
      });
    },
    [],
  );

  const handleDeleteProfile = useCallback(
    async (id: string) => {
      if (busy) {
        return;
      }
      setBusy(true);
      setBusyAction(null);
      try {
        await deleteProfile(id);
        await refreshProfiles();
      } catch (error: unknown) {
        console.error(error);
        notifications.show({
          color: 'red',
          title: t('onboarding.manage.deleteFailed'),
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, refreshProfiles, t],
  );

  const handleCreateProfile = useCallback(async () => {
    const id = crypto.randomUUID();
    const profile: ProfileRecord = {
      ...createEmptyProfile(id, t('options.profileForm.newProfileName')),
      rawText: '',
      sourceFile: undefined,
    };
    await saveProfile(profile);
    try {
      await setActiveProfileId(id);
    } catch (error: unknown) {
      console.warn('Unable to set active profile after creation', error);
    }
    setStatus({ phase: 'complete', message: t('options.profileForm.status.profileCreated') });
    setErrorDetails(null);
    await refreshProfiles(id);
  }, [refreshProfiles, t]);

  const profilesData = useMemo<ProfilesCardProfile[]>(
    () =>
      profiles.map((profile: ProfileRecord) => ({
        id: profile.id,
        name: resolveProfileName(profile, t),
        summary: formatProfileSummary(profile, t),
        parsing: formatProfileParsing(profile, t),
        isActive: selectedProfile?.id === profile.id,
      })),
    [profiles, selectedProfile?.id, t],
  );

  const fileSummary = useMemo(
    () =>
      selectedProfile?.sourceFile
        ? t('options.profileForm.upload.currentFile', [
            selectedProfile.sourceFile.name,
            selectedProfile.sourceFile.size.toLocaleString(),
          ])
        : null,
    [selectedProfile, t],
  );

  const rawSummary = useMemo(
    () =>
      selectedProfile && rawText.trim().length > 0
        ? t('options.profileForm.upload.rawSummary', [rawText.length.toLocaleString()])
        : null,
    [rawText, selectedProfile, t],
  );

  const formSaving = busy && busyAction === 'save';

  const canParseAgain = Boolean(
    selectedProfile && rawText.trim().length > 0 && isAiConfigured(
      createDeepSeekProvider(deepSeekConfig.apiKey, deepSeekConfig.model, deepSeekConfig.apiBaseUrl),
    ),
  );

  const profilesErrorLabel = profilesState.error
    ? t('onboarding.manage.error', [profilesState.error])
    : undefined;

  return {
    profiles,
    profilesState,
    profilesData,
    selectedProfile,
    refreshProfiles,
    validationErrors,
    status,
    errorDetails,
    busy,
    busyAction,
    rawText,
    filePromptOpen,
    parseAgainConfirmOpen,
    fileSummary,
    rawSummary,
    formSaving,
    canParseAgain,
    profilesErrorLabel,
    handleSaveForm,
    handleResetForm,
    handleSelectProfile,
    handleDeleteProfile,
    handleCreateProfile,
    handleFileSelect,
    handleFileAction,
    closeFilePrompt,
    openParseAgainConfirm,
    closeParseAgainConfirm,
    handleParseAgain,
  };
}

/** 把解析失败的原因翻成一句人话：校验失败优先给明细，其余用 provider 的原话。 */
function describeParseError(
  error: unknown,
  t: (key: string, substitutions?: unknown) => string,
): string {
  if (error instanceof ResumeParseError) {
    return error.message;
  }
  if (error instanceof ProviderConfigurationError || error instanceof ProviderInvocationError) {
    return error.message;
  }
  return t('options.profileForm.status.parseFailed');
}
