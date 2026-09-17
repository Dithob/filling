import type { FieldSlot } from '../apply/slotTypes';

/**
 * 字段字典的数据格式。
 *
 * 设计取向：**声明式为主，正则为例外**。
 * 实测 `adapters.ts` 那 279 个模式里，中文表几乎全是纯子串；只有英文表因为
 * 要表达 `\s*`、`(a|b)?` 这类空白与可选词，才真的需要正则。所以把最常用的
 * 四种形态做成声明式关键字，正则只作逃生舱——用户编辑 JSON 时不必写正则，
 * 也堵掉了「一条坏正则让扩展卡死」（ReDoS）这个入口。
 */

/** 匹配形态。省略即 `substring`。 */
export type MatcherMode =
  /** 子串包含（默认） */
  | 'substring'
  /** 整串相等，对应旧写法 `/^x$/` */
  | 'exact'
  /** 前缀，对应 `/^x/` */
  | 'prefix'
  /** 后缀，对应 `/x$/` */
  | 'suffix'
  /** 逃生舱：正则源码，需配 `flags`。仅英文表在用 */
  | 'regex';

export interface FieldPattern {
  /** 匹配内容。`regex` 模式时是正则源码。 */
  match: string;
  mode?: MatcherMode;
  /** 仅 `regex` 模式生效；`g` 会被忽略（有状态会串味） */
  flags?: string;
  /** 给编辑字典的人看的备注，不参与匹配 */
  note?: string;
}

export interface DictionaryAdapter {
  id: string;
  /** 内置适配器留空，展示名由 i18n 提供；自定义适配器才需要写 */
  label?: string;
  description?: string;
  enabled: boolean;
  patterns: Partial<Record<FieldSlot, FieldPattern[]>>;
}

/**
 * 枚举同义词组：`canonical -> [同义词…]`。
 *
 * 按「规范值 → 同义词列表」分组而不是老的扁平 `同义词 -> 规范值`，
 * 是为了让人能一眼看出某个字段有哪些规范值、各自有哪些写法。
 * 加载时展开成扁平表，语义与老的 `ENUM_TABLE` 完全一致。
 */
export type EnumGroups = Record<string, Record<string, string[]>>;

/** 字段的可选值（下拉、白名单等）。 */
export type FieldOptions = Record<string, string[]>;

export interface FieldDictionary {
  /** 数据结构版本，便于将来迁移 */
  version: number;
  adapters: DictionaryAdapter[];
  enums: EnumGroups;
  /**
   * 同义候选组：把 profile 的一个值展开成「页面上可能出现的所有写法」。
   *
   * 与 `enums` 有重叠但**用途不同**，所以这里保留为独立的一段：
   * `enums` 是「同义词 → 规范值」的单向归一定义（`normalizeEnum`），
   * `synonyms` 是「一组等价写法」的对称集合（`expandEnumValue` 用来匹配
   * 页面 option 文案，中英双向）。把两者合并成一份定义会更漂亮，但会改变
   * 边界输入上的行为（例如并进来之后 `其他` 会开始被归一成 `other`），
   * 属于语义变更而非数据化，留作后续单独一步。
   */
  synonyms: string[][];
  options: FieldOptions;
}

/** 编译后的匹配器：把声明式 pattern 变成可直接跑的函数。 */
export interface CompiledPattern {
  /** 实际用于比对的文本（literal 模式已小写化） */
  needle: string;
  mode: MatcherMode;
  regex?: RegExp;
  note?: string;
  /** 字典里的原始声明，报错与导出时用 */
  source: FieldPattern;
}

export type CompiledAdapterMatchers = Partial<Record<FieldSlot, CompiledPattern[]>>;

export interface CompiledAdapter {
  id: string;
  label?: string;
  description?: string;
  matchers: CompiledAdapterMatchers;
}
