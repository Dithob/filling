import { describe, expect, it } from 'vitest';
import {
  EDITOR_HIDDEN_KEYS,
  RESERVED_CUSTOM_KEYS,
  STRUCTURED_FIELD_ORDER,
  STRUCTURED_FIELD_SLOTS,
  isEditorHiddenKey,
  isReservedCustomKey,
  structuredFieldRank,
} from '../../../shared/schema/reservedCustomKeys';

/**
 * 这份清单同时被桥接层（决定 meta.custom 里哪些键是「结构化载体」而不是用户问答）
 * 和表单层（决定扩展字段编辑器怎么分类渲染）消费。两组划分一旦漂移，
 * 症状是「字段在编辑器里消失 / 改了不生效」这类很难回溯的问题，所以在这里钉死。
 */
describe('reservedCustomKeys', () => {
  it('把保留键恰好分成「可编辑的结构化字段」与「编辑器隐藏」两组', () => {
    const structured = new Set(STRUCTURED_FIELD_ORDER);
    expect(structured.size).toBe(STRUCTURED_FIELD_ORDER.length);

    const union = new Set([...STRUCTURED_FIELD_ORDER, ...EDITOR_HIDDEN_KEYS]);
    expect(union).toEqual(new Set(RESERVED_CUSTOM_KEYS));
    // 两组不相交
    expect(STRUCTURED_FIELD_ORDER.filter((key) => EDITOR_HIDDEN_KEYS.has(key))).toEqual([]);
  });

  it('每个可编辑的结构化字段都有展示文案（portfolio 单独走 slots.portfolio）', () => {
    const withoutDedicatedLabel = STRUCTURED_FIELD_ORDER.filter((key) => key !== 'portfolio');
    for (const key of withoutDedicatedLabel) {
      expect(STRUCTURED_FIELD_SLOTS[key], `${key} 缺少槽位映射`).toBeDefined();
    }
    expect(STRUCTURED_FIELD_SLOTS.portfolio).toBeUndefined();
  });

  it('识别保留键时容忍两侧空白', () => {
    expect(isReservedCustomKey('  hometown ')).toBe(true);
    expect(isReservedCustomKey('hometown')).toBe(true);
    expect(isReservedCustomKey('是否服从调剂')).toBe(false);
    expect(isEditorHiddenKey(' position')).toBe(true);
    expect(isEditorHiddenKey('hometown')).toBe(false);
  });

  it('按展示顺序排名，未知键排在最后', () => {
    expect(structuredFieldRank('nation')).toBe(0);
    expect(structuredFieldRank('researchDirection')).toBe(STRUCTURED_FIELD_ORDER.length - 1);
    expect(structuredFieldRank('unknown-key')).toBe(STRUCTURED_FIELD_ORDER.length);
  });

  it('隐藏键都是值另有作者或纯内部状态的键', () => {
    expect([...EDITOR_HIDDEN_KEYS].sort()).toEqual(
      ['awards', 'position', 'projectExp', 'resumeId'].sort(),
    );
  });
});
