import { useState } from 'react';
import {
  Accordion,
  Button,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';

interface AiParseSettingsModalProps {
  opened: boolean;
  onClose: () => void;
  /** 立刻用刚填好的凭据继续解析。 */
  onSaved: () => void;
  title: string;
  description: string;
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  modelLabel: string;
  modelHint: string;
  advancedLabel: string;
  baseUrlLabel: string;
  baseUrlPlaceholder: string;
  privacyNote: string;
  saveLabel: string;
  apiKey: string;
  model: string;
  apiBaseUrl: string;
  onApiKeyChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onApiBaseUrlChange: (value: string) => void;
}

/**
 * DeepSeek 解析凭据。
 *
 * 刻意不做成设置页里的常驻区块：AI 只服务于「导入简历」这一个动作，
 * 所以配置入口就贴着这个动作出现，设置页不必再挂一个 AI 主题。
 *
 * 输入即保存（与设置页其它项一致），底部的按钮语义是「配好了，继续」。
 */
export function AiParseSettingsModal({
  opened,
  onClose,
  onSaved,
  title,
  description,
  apiKeyLabel,
  apiKeyPlaceholder,
  modelLabel,
  modelHint,
  advancedLabel,
  baseUrlLabel,
  baseUrlPlaceholder,
  privacyNote,
  saveLabel,
  apiKey,
  model,
  apiBaseUrl,
  onApiKeyChange,
  onModelChange,
  onApiBaseUrlChange,
}: AiParseSettingsModalProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack gap="md">
        <Text fz="sm" c="dimmed">
          {description}
        </Text>

        <PasswordInput
          label={apiKeyLabel}
          placeholder={apiKeyPlaceholder}
          value={apiKey}
          onChange={(event) => onApiKeyChange(event.currentTarget.value)}
          autoComplete="off"
        />

        <TextInput
          label={modelLabel}
          value={model}
          description={modelHint}
          onChange={(event) => onModelChange(event.currentTarget.value)}
        />

        <Accordion
          variant="contained"
          value={advancedOpen ? 'advanced' : null}
          onChange={(value) => setAdvancedOpen(value === 'advanced')}
        >
          <Accordion.Item value="advanced">
            <Accordion.Control>{advancedLabel}</Accordion.Control>
            <Accordion.Panel>
              <TextInput
                label={baseUrlLabel}
                placeholder={baseUrlPlaceholder}
                value={apiBaseUrl}
                onChange={(event) => onApiBaseUrlChange(event.currentTarget.value)}
              />
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>

        <Text fz="xs" c="dimmed">
          {privacyNote}
        </Text>

        <Group justify="flex-end">
          <Button onClick={onSaved} disabled={apiKey.trim().length === 0}>
            {saveLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
