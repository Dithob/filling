import { Button, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { CheckCircle2, Circle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SectionHeading } from './SectionHeading';

export interface SetupChecklistItem {
  id: string;
  complete: boolean;
  title: string;
  description: string;
  /** 点击「打开区块」要跳到的 section id。 */
  target: string;
}

interface GettingStartedSectionProps {
  headingIcon: LucideIcon;
  headingColor: string;
  headingTitle: string;
  headingDescription?: string;
  checklist: SetupChecklistItem[];
  openSectionLabel: string;
  tip: string;
  onNavigate: (target: string) => void;
}

/**
 * 入门清单。
 *
 * 曾经有两项：档案（必做）+ AI 模型（可选）。AI 现在只服务于「导入简历时的
 * AI 解析」，配置入口就贴在导入动作里，所以这里只剩一步——装完只需要导入一份简历。
 */
export function GettingStartedSection({
  headingIcon,
  headingColor,
  headingTitle,
  headingDescription,
  checklist,
  openSectionLabel,
  tip,
  onNavigate,
}: GettingStartedSectionProps) {
  return (
    <Paper withBorder radius="lg" p="lg" shadow="sm">
      <Stack gap="md">
        <SectionHeading
          icon={headingIcon}
          color={headingColor}
          title={headingTitle}
          description={headingDescription}
        />
        <Stack gap="md">
          {checklist.map((item) => (
            <Group key={item.id} align="flex-start" gap="sm">
              <ThemeIcon size={32} variant="light" color={item.complete ? 'teal' : 'gray'} radius="xl">
                {item.complete ? <CheckCircle2 size={20} /> : <Circle size={20} />}
              </ThemeIcon>
              <Stack gap={4} style={{ flex: 1 }}>
                <Text fw={600}>{item.title}</Text>
                <Text fz="sm" c="dimmed">
                  {item.description}
                </Text>
                <Button size="xs" variant="subtle" onClick={() => onNavigate(item.target)}>
                  {openSectionLabel}
                </Button>
              </Stack>
            </Group>
          ))}
        </Stack>
        <Text fz="sm" c="dimmed">
          {tip}
        </Text>
      </Stack>
    </Paper>
  );
}
