import { Badge, Button, Group, Modal, Stack, Text } from '@mantine/core';

interface FileUploadModalProps {
  opened: boolean;
  busy: boolean;
  title: string;
  description: string;
  /** 规则解析：默认路径，零 AI 依赖。 */
  ruleLabel: string;
  ruleBadge: string;
  ruleHint: string;
  /** AI 解析：需要 DeepSeek 密钥。 */
  parseLabel: string;
  parseHint: string;
  /** 未配密钥时的提示。按钮**不禁用**——点了会引导去填密钥，再自动继续解析。 */
  parseSetupHint: string;
  aiConfigured: boolean;
  /** 仅保存 PDF 文本，不做任何抽取。 */
  storeLabel: string;
  onClose: () => void;
  onRule: () => void;
  onParse: () => void;
  onStore: () => void;
}

/**
 * 导入 PDF 时的三条路。
 *
 * 这里是全扩展**唯一**的 AI 入口：AI 只负责把简历文本转成档案 JSON，
 * 填表链路完全不碰模型。所以这里也不再需要「先去设置页开 AI」这种前置。
 */
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
  parseSetupHint,
  aiConfigured,
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
            <Button variant="default" onClick={onParse} disabled={busy}>
              {parseLabel}
            </Button>
            <Text size="xs" c="dimmed">
              {aiConfigured ? parseHint : parseSetupHint}
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
