import { useRef, useState } from 'react';
import { Alert, Button, Card, Group, Stack, Text } from '@mantine/core';
import { FileInput, FileOutput } from 'lucide-react';
import { saveProfile } from '../../../shared/storage/profiles';
import {
  createEmptyProfile,
  normalizeCnProfileData,
  type CnProfile,
} from '../../../shared/schema/cnProfile';

interface CnProfileJsonCardProps {
  profile: CnProfile | null;
  onSaved: (id: string) => void;
  t: (key: string, substitutions?: unknown) => string;
}

/**
 * 用一份 profile.json 维护所有常用信息：导出、导入、覆盖当前方案。
 * 这是「一个文件维护常用信息」的落地入口，不依赖任何 AI 解析。
 *
 * 图标刻意避开 Download / Upload 这对上下箭头：它们的语义在中文语境里是反的
 * （「导出到本地」直觉是下载、「从本地导入」直觉是上传，与数据流出方向相反），
 * 曾因此被读反过。FileOutput / FileInput 是「文件出去 / 文件进来」的语义，
 * 不依赖方向直觉，而且与「导**出** / 导**入**」字面对应。
 */
export function CnProfileJsonCard({ profile, onSaved, t }: CnProfileJsonCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    if (!profile) {
      return;
    }
    const payload = {
      name: profile.name,
      basic: profile.basic,
      education: profile.education,
      intention: profile.intention,
      links: profile.links,
      texts: profile.texts,
      attachments: profile.attachments,
      custom: profile.custom,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${profile.name || 'profile'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File | null) => {
    if (!file) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const raw = await file.text();
      const parsed: unknown = JSON.parse(raw);
      const data = normalizeCnProfileData(parsed);
      const importedName =
        parsed && typeof parsed === 'object' && typeof (parsed as { name?: unknown }).name === 'string'
          ? ((parsed as { name: string }).name.trim() || file.name.replace(/\.json$/i, ''))
          : file.name.replace(/\.json$/i, '');

      const base =
        profile ??
        createEmptyProfile(crypto.randomUUID(), importedName || t('options.profileForm.newProfileName'));

      const updated: CnProfile = {
        ...base,
        name: importedName || base.name,
        ...data,
        updatedAt: new Date().toISOString(),
      };

      await saveProfile(updated);
      onSaved(updated.id);
    } catch (parseError) {
      setError(t('options.cnProfileJson.invalid'));
      console.error('Failed to import profile.json', parseError);
    } finally {
      setBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <Card withBorder radius="lg" p="lg" shadow="sm">
      <Stack gap="sm">
        <Text fw={600}>{t('options.cnProfileJson.title')}</Text>
        <Text fz="sm" c="dimmed">
          {t('options.cnProfileJson.description')}
        </Text>
        {error && (
          <Alert variant="light" color="red">
            <Text fz="sm">{error}</Text>
          </Alert>
        )}
        <Group gap="sm">
          <Button
            variant="light"
            leftSection={<FileOutput size={16} />}
            onClick={handleExport}
            disabled={!profile}
          >
            {t('options.cnProfileJson.export')}
          </Button>
          <Button
            leftSection={<FileInput size={16} />}
            loading={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {t('options.cnProfileJson.import')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
          />
        </Group>
        {!profile && (
          <Text fz="xs" c="dimmed">
            {t('options.cnProfileJson.noProfile')}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
