import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PromptOption, PromptOptionSlot } from '../../../shared/apply/types';

interface PromptEditorProps {
  options?: PromptOption[];
  defaultSlot?: PromptOptionSlot | null;
  defaultValue?: string;
  preview?: string;
  value?: string;
  selectedSlot?: PromptOptionSlot | null;
  onValueChange?: (value: string) => void;
  onSlotChange?: (slot: PromptOptionSlot | null) => void;
  children: (state: PromptEditorState) => ReactNode;
}

export interface PromptEditorState {
  value: string;
  setValue: (value: string) => void;
  selectedSlot: PromptOptionSlot | null;
  setSelectedSlot: (slot: PromptOptionSlot | null) => void;
  options: PromptOption[];
  defaultSlot?: PromptOptionSlot | null;
  defaultValue?: string;
  preview?: string;
}

/**
 * 字段取值编辑器：选槽位 + 改值。
 *
 * 这里曾经还挂着一条「让 AI 生成这个字段的答案」的通道（输入指令 → 调模型 →
 * 回填）。那条链路已经移除：AI 现在只负责导入简历时的解析，填表侧的取值完全
 * 由字段字典与用户手动输入完成。
 */
export function PromptEditor({
  options,
  defaultSlot,
  defaultValue,
  preview,
  value: controlledValue,
  selectedSlot: controlledSlot,
  onValueChange,
  onSlotChange,
  children,
}: PromptEditorProps) {
  const normalizedOptions = useMemo(() => options ?? [], [options]);
  const [internalValue, setInternalValue] = useState<string>(defaultValue ?? preview ?? '');
  const [internalSlot, setInternalSlot] = useState<PromptOptionSlot | null>(defaultSlot ?? null);

  const valueIsControlled = controlledValue !== undefined;
  const slotIsControlled = controlledSlot !== undefined;

  useEffect(() => {
    let slot: PromptOptionSlot | null = defaultSlot ?? null;
    let nextValue = defaultValue ?? preview ?? '';

    if (normalizedOptions.length > 0) {
      const existing = slot ? normalizedOptions.find((option) => option.slot === slot) : undefined;
      if (existing) {
        nextValue = existing.value;
      } else if (!nextValue && normalizedOptions.length === 1) {
        slot = normalizedOptions[0].slot;
        nextValue = normalizedOptions[0].value;
      }
    }

    if (!slotIsControlled) {
      setInternalSlot(slot);
    }
    if (!valueIsControlled) {
      setInternalValue(nextValue);
    }
  }, [defaultSlot, defaultValue, preview, normalizedOptions, slotIsControlled, valueIsControlled]);

  const value = valueIsControlled ? controlledValue ?? '' : internalValue;
  const selectedSlot = slotIsControlled ? controlledSlot ?? null : internalSlot;

  const setValue = useCallback(
    (next: string) => {
      if (!valueIsControlled) {
        setInternalValue(next);
      }
      onValueChange?.(next);
    },
    [valueIsControlled, onValueChange],
  );

  const setSelectedSlot = useCallback(
    (slot: PromptOptionSlot | null) => {
      if (!slotIsControlled) {
        setInternalSlot(slot);
      }
      onSlotChange?.(slot);
    },
    [slotIsControlled, onSlotChange],
  );

  return (
    <>
      {children({
        value,
        setValue,
        selectedSlot,
        setSelectedSlot,
        options: normalizedOptions,
        defaultSlot,
        defaultValue,
        preview,
      })}
    </>
  );
}
