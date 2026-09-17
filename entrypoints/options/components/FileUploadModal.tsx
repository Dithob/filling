import { Badge, Button, Group, Modal, Stack, Text } from '@mantine/core';

interface FileUploadModalProps {
  opened: boolean;
  busy: boolean;
  title: string;
  description: string;
  /** 规则抽取：默认路径，零 AI 依赖。 */
  ruleLabel: string;
  ruleBadge: string;
  ruleHint: string;
  /** AI 解析：可选路径，仅在已配置服务提供方时可用。 */
  parseLabel: string;
  parseHint: string;
  parseUnavailableHint: string;
  aiAvailable: boolean;
  /** 仅保存 PDF 文本，不做任何抽取。 */
  storeLabel: string;
  onClose: () => void;
  onRule: () => void;
  onParse: () => void;
  onStore: () => void;
}

export function FileUploadModal({
  opened,
  busy,
  title,
  description,
  ruleLabel,
  ruleBadge,
  ruleHint,
  parseLabel,
  parseHint,
  parseUnavailableHint,
  aiAvailable,
  storeLabel,
  onClose,
  onRule,
  onParse,
  onStore,
}: FileUploadModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack gap="md">
        <Text>{description}</Text>
        <Stack gap="sm">
          <Stack gap={4}>
            <Group gap="xs" wrap="nowrap">
              <Button onClick={onRule} disabled={busy} style={{ flex: 1 }}>
                {ruleLabel}
              </Button>
              <Badge color="teal" variant="light">
                {ruleBadge}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              {ruleHint}
            </Text>
          </Stack>

          <Stack gap={4}>
            <Button
              variant="default"
              onClick={onParse}
              disabled={busy || !aiAvailable}
              title={aiAvailable ? undefined : parseUnavailableHint}
            >
              {parseLabel}
            </Button>
            <Text size="xs" c="dimmed">
              {aiAvailable ? parseHint : parseUnavailableHint}
            </Text>
          </Stack>

          <Button variant="subtle" color="gray" onClick={onStore} disabled={busy}>
            {storeLabel}
          </Button>
        </Stack>
      </Stack>
    </Modal>
  );
}
