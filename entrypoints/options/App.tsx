import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Container,
  Drawer,
  Flex,
  Grid,
  Group,
  List,
  Modal,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { useForm } from 'react-hook-form';
import { useMediaQuery } from '@mantine/hooks';
import { IdCard, PanelRightOpen, SlidersHorizontal, Sparkles, WandSparkles } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { ProfilesCard } from './components/ProfilesCard';
import { CnProfileJsonCard } from './components/CnProfileJsonCard';
import { AdaptersCard } from './components/AdaptersCard';
import { AutofillCard } from './components/AutofillCard';
import { FillModeCard } from './components/FillModeCard';
import { OverlayCard } from './components/OverlayCard';
import { MemoryCard } from './components/MemoryCard';
import { SectionHeading } from './components/SectionHeading';
import { OptionsNavigationCard, type TocNavLink } from './components/OptionsNavigationCard';
import { GettingStartedSection, type SetupChecklistItem } from './components/GettingStartedSection';
import { FileUploadModal } from './components/FileUploadModal';
import { AiParseSettingsModal } from './components/AiParseSettingsModal';
import { ParseAgainModal } from './components/ParseAgainModal';
import { RenameProfileModal } from './components/RenameProfileModal';
import { CelebrationOverlay } from './components/CelebrationOverlay';
import { ResumePreviewPane } from './components/ResumePreviewPane';
import './App.css';
import {
  ProfileForm,
  createEmptyResumeFormValues,
  type ResumeFormValues,
} from './components/ProfileForm';
import { useSettings } from './hooks/useSettings';
import { useMemoryStore } from './hooks/useMemoryStore';
import { useProfilesManager } from './hooks/useProfilesManager';

export default function App() {
  const form = useForm<ResumeFormValues>({
    defaultValues: createEmptyResumeFormValues(),
  });
  const uploadInputId = 'profile-form-upload';
  const isWideWorkspace = useMediaQuery('(min-width: 1100px)');
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const [celebrationVersion, setCelebrationVersion] = useState(0);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [previewDrawerOpen, setPreviewDrawerOpen] = useState(false);
  const [aiSetupOpen, setAiSetupOpen] = useState(false);
  const [pendingAiParse, setPendingAiParse] = useState(false);
  const statusNotificationId = useRef<string | null>(null);
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const setupSectionRef = useRef<HTMLDivElement | null>(null);
  const profilesSectionRef = useRef<HTMLDivElement | null>(null);
  const autofillSectionRef = useRef<HTMLDivElement | null>(null);
  const advancedSectionRef = useRef<HTMLDivElement | null>(null);
  const { t } = i18n;
  const translate = t as unknown as (key: string, substitutions?: unknown) => string;
  const {
    deepSeekConfig,
    autoFallback,
    fillMode,
    highlightOverlay,
    aiConfigured,
    adapterItems,
    handleDeepSeekApiKeyChange,
    handleDeepSeekModelChange,
    handleDeepSeekApiBaseUrlChange,
    handleToggleAdapter,
    handleAutoFallbackChange,
    handleFillModeChange,
    handleHighlightOverlayChange,
  } = useSettings({ translate });
  const {
    profiles,
    profilesState,
    profilesData,
    selectedProfile,
    refreshProfiles,
    validationErrors,
    status,
    errorDetails,
    busy,
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
    renameTargetId,
    renameInitialName,
    validateRenameInput,
    handleOpenRename,
    handleCloseRename,
    handleRenameProfile,
    handleFileSelect,
    handleFileAction,
    closeFilePrompt,
    openParseAgainConfirm,
    closeParseAgainConfirm,
    handleParseAgain,
  } = useProfilesManager({
    form,
    deepSeekConfig,
    t,
  });
  const { memoryItems, memoryState, refreshMemory, clearMemory, deleteMemory, formatMemoryEntry } =
    useMemoryStore({ t });
  useEffect(() => {
    if (!selectedProfile) {
      setWorkspaceOpen(false);
      setPreviewDrawerOpen(false);
    }
  }, [selectedProfile]);
  const handleOpenWorkspace = useCallback(() => {
    if (!selectedProfile) {
      return;
    }
    setWorkspaceOpen(true);
  }, [selectedProfile]);
  const handleCloseWorkspace = useCallback(() => {
    setWorkspaceOpen(false);
  }, []);
  useEffect(() => {
    if (isWideWorkspace) {
      setPreviewDrawerOpen(false);
    }
  }, [isWideWorkspace]);
  useEffect(() => {
    if (!workspaceOpen) {
      setPreviewDrawerOpen(false);
    }
  }, [workspaceOpen]);
  const profileFormProps = useMemo(
    () => ({
      form,
      onSubmit: handleSaveForm,
      onReset: handleResetForm,
      disabled: busy,
      saving: formSaving,
      onFileSelect: handleFileSelect,
      onParseAgain: canParseAgain ? openParseAgainConfirm : undefined,
      parseAgainDisabled: !canParseAgain,
      fileSummary,
      rawSummary,
      uploadInputId,
    }),
    [
      form,
      handleSaveForm,
      handleResetForm,
      busy,
      formSaving,
      handleFileSelect,
      canParseAgain,
      openParseAgainConfirm,
      fileSummary,
      rawSummary,
      uploadInputId,
    ],
  );

  /**
   * 点「AI 解析」时：配好了就直接跑，没配就先弹凭据配置，配完自动接着解析——
   * 用户不用在两处之间来回跳。
   */
  const handleAiParseRequest = useCallback(() => {
    if (aiConfigured) {
      void handleFileAction('parse');
      return;
    }
    setPendingAiParse(true);
    setAiSetupOpen(true);
  }, [aiConfigured, handleFileAction]);

  const handleAiSetupClose = useCallback(() => {
    setAiSetupOpen(false);
    setPendingAiParse(false);
  }, []);

  const handleAiSetupSaved = useCallback(() => {
    setAiSetupOpen(false);
    if (!pendingAiParse) {
      return;
    }
    setPendingAiParse(false);
    void handleFileAction('parse');
  }, [handleFileAction, pendingAiParse]);

  useEffect(() => {
    let mounted = true;
    browser.storage.local
      .get('onboarding:completed')
      .then((result) => {
        if (!mounted) {
          return;
        }
        const completed = Boolean(result['onboarding:completed']);
        setOnboardingCompleted(completed);
      })
      .catch(() => {
        if (mounted) {
          setOnboardingCompleted(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);
  const profileCountLabel = profiles.length.toLocaleString();
  const hasProfiles = profiles.length > 0;
  const setupChecklist = useMemo<SetupChecklistItem[]>(
    () => [
      {
        id: 'profile',
        complete: hasProfiles,
        title: t('options.checklist.profile.title'),
        description: t('options.checklist.profile.description'),
        target: 'section-profiles',
      },
    ],
    [hasProfiles, t],
  );

  const navLinks = useMemo<TocNavLink[]>(
    () => [
      {
        id: 'section-getting-started',
        label: t('options.sections.gettingStarted'),
        icon: Sparkles,
        color: 'orange',
      },
      {
        id: 'section-profiles',
        label: t('options.sections.profiles'),
        icon: IdCard,
        color: 'indigo',
      },
      {
        id: 'section-autofill',
        label: t('options.sections.autofill'),
        icon: WandSparkles,
        color: 'teal',
      },
      {
        id: 'section-advanced',
        label: t('options.sections.advanced'),
        icon: SlidersHorizontal,
        color: 'gray',
      },
    ],
    [t],
  );

  useEffect(() => {
    if (!hasProfiles || onboardingCompleted === null) {
      return;
    }
    if (!onboardingCompleted) {
      setCelebrationVersion((value) => value + 1);
      setCelebrationOpen(true);
      setOnboardingCompleted(true);
      void browser.storage.local.set({ 'onboarding:completed': true }).catch((error) => {
        console.warn('Unable to persist onboarding completion', error);
      });
    }
  }, [hasProfiles, onboardingCompleted]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const triggerSectionHighlight = useCallback((id: string) => {
    setHighlightedSection(id);
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedSection((current) => (current === id ? null : current));
    }, 1600);
  }, []);

  const handleScrollTo = useCallback(
    (id: string) => {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        triggerSectionHighlight(id);
      }
    },
    [triggerSectionHighlight],
  );

  useEffect(() => {
    const activeId = statusNotificationId.current;

    if (!status.message) {
      if (activeId) {
        notifications.hide(activeId);
        statusNotificationId.current = null;
      }
      return;
    }

    const baseId = activeId ?? `status-${Date.now()}`;

    if (status.phase === 'idle') {
      if (activeId) {
        notifications.hide(activeId);
        statusNotificationId.current = null;
      }
      return;
    }

    if (status.phase === 'complete') {
      const payload = {
        id: baseId,
        color: 'teal' as const,
        title: status.message,
        message: errorDetails ?? undefined,
        autoClose: 4000,
        withCloseButton: true,
        loading: false,
      };
      if (activeId) {
        notifications.update(payload);
      } else {
        notifications.show(payload);
      }
      statusNotificationId.current = null;
      return;
    }

    if (status.phase === 'error') {
      const payload = {
        id: baseId,
        color: 'red' as const,
        title: status.message,
        message: errorDetails ?? undefined,
        autoClose: 6000,
        withCloseButton: true,
        loading: false,
      };
      if (activeId) {
        notifications.update(payload);
      } else {
        notifications.show(payload);
      }
      statusNotificationId.current = null;
      return;
    }

    const payload = {
      id: baseId,
      color: 'brand' as const,
      title: status.message,
      message: errorDetails ?? undefined,
      autoClose: false,
      withCloseButton: false,
      loading: true,
    };

    if (activeId) {
      notifications.update(payload);
    } else {
      notifications.show(payload);
    }
    statusNotificationId.current = baseId;
  }, [status, errorDetails]);

  const sectionClassName = useCallback(
    (id: string) =>
      highlightedSection === id
        ? 'fieldbook-options__section fieldbook-options__section--highlighted'
        : 'fieldbook-options__section',
    [highlightedSection],
  );

  return (
    <>
      <Container size="xl" py="xl" className="fieldbook-options__container">
        <Stack gap="xl">
          <Group align="flex-start" justify="space-between" gap="xl" wrap="wrap">
            <Stack gap={4} className="fieldbook-options__intro">
              <Title order={1}>{t('options.title')}</Title>
              <Text c="dimmed">{t('options.description')}</Text>
            </Stack>

          </Group>

          <Flex gap="xl" align="flex-start" direction={{ base: 'column', md: 'row' }}>
          <OptionsNavigationCard
            className="fieldbook-options__toc fieldbook-options__toc-sticky"
            title={t('options.toc.title')}
            helper={t('options.toc.helper')}
            links={navLinks}
            onNavigate={handleScrollTo}
          />

          <Stack flex={1} gap="xl">
            <Box
              id="section-getting-started"
              ref={setupSectionRef}
              className={sectionClassName('section-getting-started')}
            >
              <GettingStartedSection
                headingIcon={Sparkles}
                headingColor="orange"
                headingTitle={t('options.sections.gettingStarted')}
                headingDescription={t('options.gettingStarted.helper')}
                checklist={setupChecklist}
                openSectionLabel={t('options.checklist.openSection')}
                tip={t('options.gettingStarted.tip')}
                onNavigate={handleScrollTo}
              />
            </Box>

            <Box
              id="section-profiles"
              ref={profilesSectionRef}
              className={sectionClassName('section-profiles')}
            >
              <Stack gap="xl">
                <ProfilesCard
                  title={t('onboarding.manage.heading')}
                  countLabel={t('onboarding.manage.count', [profileCountLabel])}
                  addLabel={t('onboarding.manage.addProfile')}
                  loadingLabel={t('onboarding.manage.loading')}
                  emptyLabel={t('onboarding.manage.empty')}
                  renameLabel={t('onboarding.manage.rename.action')}
                  deleteLabel={t('onboarding.manage.delete')}
                  errorLabel={profilesErrorLabel}
                  headingIcon={IdCard}
                  headingIconColor="indigo"
                  profiles={profilesData}
                  isLoading={profilesState.loading}
                  busy={busy}
                  onCreate={handleCreateProfile}
                  onSelect={handleSelectProfile}
                  onDelete={handleDeleteProfile}
                  onRename={handleOpenRename}
                />

                <CnProfileJsonCard
                  profile={selectedProfile}
                  onSaved={(id) => {
                    void refreshProfiles(id);
                    handleSelectProfile(id);
                  }}
                  t={t}
                />

                <Stack gap="md">
                  {selectedProfile ? (
                    workspaceOpen ? null : (
                      <Grid gutter="md" align="stretch">
                        <Grid.Col span={{ base: 12, md: 7, xl: 8 }}>
                          <ProfileForm {...profileFormProps} />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 5, xl: 4 }}>
                          <ResumePreviewPane
                            profileId={selectedProfile.id}
                            file={selectedProfile.sourceFile}
                            fileSummary={fileSummary}
                            rawSummary={rawSummary}
                            rawText={rawText}
                            uploadInputId={uploadInputId}
                            onOpenWorkspace={handleOpenWorkspace}
                          />
                        </Grid.Col>
                      </Grid>
                    )
                  ) : (
                    <Paper withBorder radius="lg" p="lg" shadow="sm">
                      <Stack gap="sm">
                        <Text fw={600}>{t('options.profileForm.empty.heading')}</Text>
                        <Text fz="sm" c="dimmed">
                          {t('options.profileForm.empty.description')}
                        </Text>
                        <Button variant="light" onClick={handleCreateProfile} disabled={busy}>
                          {t('options.profileForm.empty.create')}
                        </Button>
                      </Stack>
                    </Paper>
                  )}

                  {validationErrors.length > 0 && (
                    <Alert variant="light" color="yellow">
                      <Stack gap="xs">
                        <Text fw={600}>{t('onboarding.validation.heading')}</Text>
                        <List spacing={4} size="sm">
                          {validationErrors.map((item) => (
                            <List.Item key={item}>{item}</List.Item>
                          ))}
                        </List>
                      </Stack>
                    </Alert>
                  )}
                </Stack>
              </Stack>
            </Box>

            <Box
              id="section-autofill"
              ref={autofillSectionRef}
              className={sectionClassName('section-autofill')}
            >
              <Stack gap="md">
                <SectionHeading
                  icon={WandSparkles}
                  color="teal"
                  title={t('options.sections.autofill')}
                  description={t('options.autofill.description')}
                />
                <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
                  <AdaptersCard
                    title={t('options.adapters.heading')}
                    description={t('options.adapters.description')}
                    items={adapterItems}
                    onToggle={handleToggleAdapter}
                  />

                  <AutofillCard
                    title={t('options.autofill.heading')}
                    description={t('options.autofill.description')}
                    value={autoFallback}
                    skipLabel={t('options.autofill.skip')}
                    pauseLabel={t('options.autofill.pause')}
                    onChange={handleAutoFallbackChange}
                  />

                  <FillModeCard
                    title={t('options.fillMode.heading')}
                    description={t('options.fillMode.description')}
                    value={fillMode}
                    emptyOnlyLabel={t('options.fillMode.emptyOnly')}
                    emptyOnlyHint={t('options.fillMode.emptyOnlyHint')}
                    overwriteLabel={t('options.fillMode.overwrite')}
                    overwriteHint={t('options.fillMode.overwriteHint')}
                    onChange={handleFillModeChange}
                  />

                  <OverlayCard
                    title={translate('options.overlay.heading')}
                    description={translate('options.overlay.description')}
                    toggleLabel={translate('options.overlay.toggle')}
                    enabledHint={translate('options.overlay.enabled')}
                    disabledHint={translate('options.overlay.disabled')}
                    value={highlightOverlay}
                    onChange={handleHighlightOverlayChange}
                  />
                </SimpleGrid>
              </Stack>
            </Box>

            <Box
              id="section-advanced"
              ref={advancedSectionRef}
              className={sectionClassName('section-advanced')}
            >
              <Stack gap="md">
                <SectionHeading
                  icon={SlidersHorizontal}
                  color="gray"
                  title={t('options.sections.advanced')}
                  description={t('options.advanced.description')}
                />

                <MemoryCard
                  title={t('options.memory.heading')}
                  description={t('options.memory.description')}
                  refreshLabel={t('options.memory.refresh')}
                  clearLabel={t('options.memory.clearAll')}
                  deleteLabel={t('options.memory.delete')}
                  emptyLabel={t('options.memory.empty')}
                  loadingLabel={t('options.memory.loading')}
                  error={memoryState.error ? t('options.memory.error', [memoryState.error]) : undefined}
                  items={memoryItems}
                  loading={memoryState.loading}
                  onRefresh={() => {
                    void refreshMemory();
                  }}
                  onClearAll={() => {
                    void clearMemory();
                  }}
                  onDelete={(key) => {
                    void deleteMemory(key);
                  }}
                  formatEntry={formatMemoryEntry}
                />
              </Stack>
            </Box>
          </Stack>
        </Flex>
      </Stack>

      <FileUploadModal
        opened={filePromptOpen}
        onClose={closeFilePrompt}
        title={t('options.profileForm.upload.modalTitle')}
        description={t('options.profileForm.upload.modalDescription')}
        ruleLabel={t('options.profileForm.upload.ruleAction')}
        ruleBadge={t('options.profileForm.upload.ruleBadge')}
        ruleHint={t('options.profileForm.upload.ruleHint')}
        parseLabel={t('options.profileForm.upload.parseAction')}
        parseHint={t('options.profileForm.upload.parseHint')}
        parseSetupHint={t('options.profileForm.upload.parseSetupHint')}
        aiConfigured={aiConfigured}
        storeLabel={t('options.profileForm.upload.storeAction')}
        busy={busy}
        onRule={() => handleFileAction('rule')}
        onParse={handleAiParseRequest}
        onStore={() => handleFileAction('store')}
      />

      <AiParseSettingsModal
        opened={aiSetupOpen}
        onClose={handleAiSetupClose}
        onSaved={handleAiSetupSaved}
        title={t('options.aiParse.title')}
        description={t('options.aiParse.description')}
        apiKeyLabel={t('options.aiParse.apiKey')}
        apiKeyPlaceholder={t('options.aiParse.apiKeyPlaceholder')}
        modelLabel={t('options.aiParse.model')}
        modelHint={t('options.aiParse.modelHint')}
        advancedLabel={t('options.aiParse.advanced')}
        baseUrlLabel={t('options.aiParse.baseUrl')}
        baseUrlPlaceholder={t('options.aiParse.baseUrlPlaceholder')}
        privacyNote={t('options.aiParse.privacyNote')}
        saveLabel={t('options.aiParse.save')}
        apiKey={deepSeekConfig.apiKey}
        model={deepSeekConfig.model}
        apiBaseUrl={deepSeekConfig.apiBaseUrl}
        onApiKeyChange={handleDeepSeekApiKeyChange}
        onModelChange={handleDeepSeekModelChange}
        onApiBaseUrlChange={handleDeepSeekApiBaseUrlChange}
      />

      <RenameProfileModal
        opened={renameTargetId !== null}
        onClose={handleCloseRename}
        title={t('onboarding.manage.rename.title')}
        description={t('onboarding.manage.rename.description')}
        label={t('onboarding.manage.rename.label')}
        placeholder={t('onboarding.manage.rename.placeholder')}
        cancelLabel={t('onboarding.manage.rename.cancel')}
        confirmLabel={t('onboarding.manage.rename.confirm')}
        initialValue={renameInitialName}
        validate={validateRenameInput}
        busy={busy}
        onConfirm={handleRenameProfile}
      />

      <ParseAgainModal
        opened={parseAgainConfirmOpen}
        onClose={closeParseAgainConfirm}
        title={translate('options.profileForm.upload.parseAgainConfirmTitle')}
        description={translate('options.profileForm.upload.parseAgainConfirmDescription')}
        cancelLabel={translate('options.profileForm.upload.parseAgainConfirmCancel')}
        confirmLabel={translate('options.profileForm.upload.parseAgainConfirmConfirm')}
        busy={busy}
        onConfirm={handleParseAgain}
      />

      <Modal
        opened={workspaceOpen}
        onClose={handleCloseWorkspace}
        title={t('options.profileForm.preview.workspaceTitle')}
        fullScreen
        radius={0}
        padding={0}
        styles={{
          content: {
            padding: 0,
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
          },
          header: {
            padding: 'var(--mantine-spacing-md) var(--mantine-spacing-xl)',
            flexShrink: 0,
          },
          body: {
            padding: 'var(--mantine-spacing-xl)',
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
        }}
      >
        {workspaceOpen && selectedProfile ? (
          <Box className={`fieldbook-workspace${isWideWorkspace ? '' : ' fieldbook-workspace--compact'}`}>
            {!isWideWorkspace && (
              <Box className="fieldbook-workspace__preview-toggle">
                <Tooltip label={t('options.profileForm.preview.openPreviewDrawer')} withArrow>
                  <ActionIcon
                    variant="light"
                    color="gray"
                    onClick={() => setPreviewDrawerOpen(true)}
                    aria-label={t('options.profileForm.preview.openPreviewDrawer')}
                  >
                    <PanelRightOpen size={18} />
                  </ActionIcon>
                </Tooltip>
              </Box>
            )}
            <Box
              className={`fieldbook-workspace__layout${isWideWorkspace ? '' : ' fieldbook-workspace__layout--single'}`}
            >
              <Box className="fieldbook-workspace__form">
                <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto">
                  <ProfileForm {...profileFormProps} />
                </ScrollArea>
              </Box>
              {isWideWorkspace ? (
                <Box className="fieldbook-workspace__preview">
                  <ResumePreviewPane
                    profileId={selectedProfile.id}
                    file={selectedProfile.sourceFile}
                    fileSummary={fileSummary}
                    rawSummary={rawSummary}
                    rawText={rawText}
                    uploadInputId={uploadInputId}
                    variant="modal"
                  />
                </Box>
              ) : null}
            </Box>
          </Box>
        ) : (
          <Stack gap="sm">
            <Text fw={600}>{t('options.profileForm.preview.noProfile')}</Text>
            <Text fz="sm" c="dimmed">
              {t('options.profileForm.preview.workspaceDescription')}
            </Text>
            <Button variant="light" onClick={handleCloseWorkspace}>
              {t('options.profileForm.preview.close')}
            </Button>
          </Stack>
        )}
      </Modal>
      <Drawer
        opened={previewDrawerOpen && !isWideWorkspace}
        onClose={() => setPreviewDrawerOpen(false)}
        title={t('options.profileForm.preview.drawerTitle')}
        position="right"
        size="lg"
        padding="lg"
        styles={{
          content: {
            overflow: 'hidden',
          },
          body: {
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            padding: 'var(--mantine-spacing-lg)',
            overflow: 'hidden',
          },
        }}
      >
        {selectedProfile ? (
          <Box style={{ flex: 1, minHeight: 0 }}>
            <ResumePreviewPane
              profileId={selectedProfile.id}
              file={selectedProfile.sourceFile}
              fileSummary={fileSummary}
              rawSummary={rawSummary}
              rawText={rawText}
              uploadInputId={uploadInputId}
              variant="modal"
            />
          </Box>
        ) : (
          <Stack gap="sm">
            <Text fw={600}>{t('options.profileForm.preview.noProfile')}</Text>
            <Button variant="light" onClick={() => setPreviewDrawerOpen(false)}>
              {t('options.profileForm.preview.close')}
            </Button>
          </Stack>
        )}
      </Drawer>
    </Container>
      <CelebrationOverlay
        open={celebrationOpen}
        version={celebrationVersion}
        title={t('options.celebration.title')}
        message={t('options.celebration.message')}
        ctaLabel={t('options.celebration.cta')}
        onClose={() => setCelebrationOpen(false)}
        onCta={() => {
          setCelebrationOpen(false);
          handleScrollTo('section-autofill');
        }}
      />
    </>
  );
}
