import { Badge, Button, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { CheckCircle2, Circle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SectionHeading } from './SectionHeading';

export interface SetupChecklistItem {
  id: string;
  complete: boolean;
  title: string;
  description: string;
  target: string;
  /**
   * Optional steps never block setup. They are rendered with a badge and a
   * neutral (not "unfinished") marker so a user who does not want the AI
   * features is not nudged into a permanent incomplete state.
   */
  optional?: boolean;
}

interface GettingStartedSectionProps {
  headingIcon: LucideIcon;
  headingColor: string;
  headingTitle: string;
  headingDescription?: string;
  checklist: SetupChecklistItem[];
  openSectionLabel: string;
  optionalLabel: string;
  tip: string;
  onNavigate: (target: string) => void;
}

export function GettingStartedSection({
  headingIcon,
  headingColor,
  headingTitle,
  headingDescription,
  checklist,
  openSectionLabel,
  optionalLabel,
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
          {checklist.map((item) => {
            const iconColor = item.complete ? 'teal' : item.optional ? 'blue' : 'gray';
            return (
              <Group key={item.id} align="flex-start" gap="sm">
                <ThemeIcon size={32} variant="light" color={iconColor} radius="xl">
                  {item.complete ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                </ThemeIcon>
                <Stack gap={4} style={{ flex: 1 }}>
                  <Group gap="xs" align="center">
                    <Text fw={600}>{item.title}</Text>
                    {item.optional ? (
                      <Badge size="sm" variant="light" color="blue">
                        {optionalLabel}
                      </Badge>
                    ) : null}
                  </Group>
                  <Text fz="sm" c="dimmed">
                    {item.description}
                  </Text>
                  <Button size="xs" variant="subtle" onClick={() => onNavigate(item.target)}>
                    {openSectionLabel}
                  </Button>
                </Stack>
              </Group>
            );
          })}
        </Stack>
        <Text fz="sm" c="dimmed">
          {tip}
        </Text>
      </Stack>
    </Paper>
  );
}
