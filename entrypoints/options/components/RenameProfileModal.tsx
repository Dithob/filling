import { useEffect, useState } from 'react';
import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';

interface RenameProfileModalProps {
  opened: boolean;
  busy: boolean;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  cancelLabel: string;
  confirmLabel: string;
  /** 输入框的初始值（当前档案名）。 */
  initialValue: string;
  /** 返回错误文案；null 表示合法。由调用方注入，保证弹窗与 hook 用同一套规则。 */
  validate: (value: string) => string | null;
  onClose: () => void;
  onConfirm: (value: string) => void;
}

/**
 * 档案重命名弹窗。与 ParseAgainModal 同一套骨架，只多了一个受控输入框。
 *
 * 交互约定：回车即提交；校验失败只在输入框下报错、不关弹窗；
 * 提交之后关不关由父层决定——保存失败时保持打开，用户可以直接重试。
 */
export function RenameProfileModal({
  opened,
  busy,
  title,
  description,
  label,
  placeholder,
  cancelLabel,
  confirmLabel,
  initialValue,
  validate,
  onClose,
  onConfirm,
}: RenameProfileModalProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  // 每次打开都回到当前档案名，避免上一次的输入残留。
  useEffect(() => {
    if (opened) {
      setValue(initialValue);
      setError(null);
    }
  }, [initialValue, opened]);

  const submit = () => {
    const message = validate(value);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    onConfirm(value);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Stack gap="md">
          <Text fz="sm" c="dimmed">
            {description}
          </Text>
          <TextInput
            label={label}
            placeholder={placeholder}
            value={value}
            error={error}
            disabled={busy}
            data-autofocus
            onChange={(event) => {
              setValue(event.currentTarget.value);
              if (error) {
                setError(null);
              }
            }}
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={onClose} disabled={busy}>
              {cancelLabel}
            </Button>
            <Button type="submit" disabled={busy}>
              {confirmLabel}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
