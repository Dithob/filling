import defaultsJson from './defaults.json';
import type { FieldDictionary } from './types';

/**
 * 内置字段字典（`defaults.json`）。
 *
 * 它是**兜底数据**，不是「默认值」那么简单：任何时刻字典读取失败（storage 里没有
 * 覆盖、JSON 损坏、导入非法）都回落到这里，因此扩展永远有一份能用的字典，
 * 不存在「改坏字典导致扩展打不开」的情况。
 *
 * JSON 由旧的正则表机械转换而来（见 tests/shared/dictionary/equivalence.test.ts
 * 的等价性测试），转换过程没有人工判断，避免引入主观偏差。
 */
export const DEFAULT_DICTIONARY = defaultsJson as unknown as FieldDictionary;
