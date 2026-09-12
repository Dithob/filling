import { Paper, Radio, Stack, Text } from '@mantine/core';
import type { AppSettings } from '../../../shared/types';

interface FillModeCardProps {
  title: string;
  description: string;
  value: AppSettings['fillMode'];
  emptyOnlyLabel: string;
  emptyOnlyHint: string;
  overwriteLabel: string;
  overwriteHint: string;
  onChange: (value: AppSettings['fillMode']) => void;
}

/** 「只填空 / 可覆盖」策略：批量填充时是否动页面上已经填好的字段。 */
export function FillModeCard({
  title,
  description,
  value,
  emptyOnlyLabel,
  emptyOnlyHint,
  overwriteLabel,
  overwriteHint,
  onChange,
}: FillModeCardProps) {
  return (
    <Paper withBorder radius="lg" p="lg" shadow="sm">
      <Stack gap="md">
        <Stack gap={4}>
          <Text fw={600} fz="lg">
            {title}
          </Text>
          <Text fz="sm" c="dimmed">
            {description}
          </Text>
        </Stack>
        <Radio.Group
          value={value}
          onChange={(next) => onChange(next === 'overwrite' ? 'overwrite' : 'emptyOnly')}
        >
          <Stack gap="xs">
            <Radio value="emptyOnly" label={emptyOnlyLabel} description={emptyOnlyHint} />
            <Radio value="overwrite" label={overwriteLabel} description={overwriteHint} />
          </Stack>
        </Radio.Group>
      </Stack>
    </Paper>
  );
}
