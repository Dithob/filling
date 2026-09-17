import { browser } from 'wxt/browser';
import { compileDictionary, expandEnumGroups, parseDictionary, type CompileIssue } from './compile';
import { DEFAULT_DICTIONARY } from './defaults';
import type { CompiledAdapter, EnumGroups, FieldDictionary, FieldOptions } from './types';

/**
 * 字典的运行时状态：一份编译好的匹配器 + 展开好的枚举表。
 *
 * 匹配是**同步**调用（`resolveSlotFromLabel` 在扫描与填充的热路径上），所以这里
 * 用模块级缓存而不是每次异步读 storage：缓存初值是内置字典，`hydrate()` 把
 * storage 里的用户覆盖换进来。任何失败都保留当前缓存。
 */
export interface DictionaryState {
  /** 当前生效的原始 JSON（导出用） */
  dictionary: FieldDictionary;
  adapters: CompiledAdapter[];
  /** 扁平「同义词 -> 规范值」，与旧的 ENUM_TABLE 同形 */
  enums: Record<string, Record<string, string>>;
  /** 同义候选组，与旧的 ENUM_SYNONYM_GROUPS 同形 */
  synonyms: string[][];
  options: FieldOptions;
  issues: CompileIssue[];
  /** 是否来自 storage 里的用户覆盖（false = 内置字典） */
  customized: boolean;
}

export const DICTIONARY_STORAGE_KEY = 'dictionary:v1';

function buildState(raw: unknown, customized: boolean): DictionaryState {
  const { dictionary, errors } = parseDictionary(raw);
  // 解析不出结构就整份退回内置：宁可丢掉用户的半截字典，也不能让匹配器空转。
  if (!dictionary) {
    const fallback = compileDictionary(DEFAULT_DICTIONARY);
    return {
      dictionary: DEFAULT_DICTIONARY,
      adapters: fallback.adapters,
      enums: expandEnumGroups(DEFAULT_DICTIONARY.enums),
      synonyms: DEFAULT_DICTIONARY.synonyms ?? [],
      options: DEFAULT_DICTIONARY.options ?? {},
      issues: errors.map((message) => ({ adapterId: '(dictionary)', message })),
      customized: false,
    };
  }
  const compiled = compileDictionary(dictionary);
  return {
    dictionary,
    adapters: compiled.adapters,
    enums: expandEnumGroups(dictionary.enums),
    synonyms: dictionary.synonyms ?? [],
    options: dictionary.options ?? {},
    issues: [...errors.map((message) => ({ adapterId: '(dictionary)', message })), ...compiled.issues],
    customized,
  };
}

function initialState(): DictionaryState {
  return buildState(DEFAULT_DICTIONARY, false);
}

let state: DictionaryState = initialState();
let hydration: Promise<DictionaryState> | null = null;
const listeners = new Set<(state: DictionaryState) => void>();

/** 同步读当前字典。任何消费者都可以直接调，永远有值。 */
export function getDictionary(): DictionaryState {
  return state;
}

function updateState(next: DictionaryState): void {
  state = next;
  for (const listener of listeners) {
    try {
      listener(next);
    } catch (error) {
      console.error('[dictionary] listener failed', error);
    }
  }
}

/**
 * 把 storage 里的用户覆盖加载进来。幂等：重复调用共用同一个 promise。
 *
 * 刻意**永不 reject**——字典加载失败不该让调用方（扫描、填充）跟着失败，
 * 回落到内置字典就是正确行为。
 */
export function hydrateDictionary(force = false): Promise<DictionaryState> {
  if (force) {
    hydration = null;
  }
  hydration ??= (async () => {
    try {
      const stored = await browser.storage.local.get(DICTIONARY_STORAGE_KEY);
      const raw = stored?.[DICTIONARY_STORAGE_KEY];
      if (raw === undefined || raw === null) {
        updateState(buildState(DEFAULT_DICTIONARY, false));
        return state;
      }
      updateState(buildState(raw, true));
      return state;
    } catch (error) {
      console.error('[dictionary] hydrate failed, keeping built-in dictionary', error);
      return state;
    }
  })();
  return hydration;
}

/** 用一份外部 JSON 覆盖字典（导入）。返回逐条错误，为空表示完全成功。 */
export async function importDictionary(raw: unknown): Promise<{ errors: string[] }> {
  const { dictionary, errors } = parseDictionary(raw);
  if (!dictionary) {
    return { errors };
  }
  // 先编译一遍：坏正则不让它落盘，避免下次启动才暴露。
  const compiled = compileDictionary(dictionary);
  const fatal = compiled.adapters.length === 0;
  if (fatal) {
    return { errors: [...errors, '没有任何可用的适配器，未写入'] };
  }
  await browser.storage.local.set({ [DICTIONARY_STORAGE_KEY]: dictionary });
  updateState(buildState(dictionary, true));
  return { errors };
}

/** 导出当前生效的字典（含内置或用户覆盖）。 */
export function exportDictionary(): FieldDictionary {
  return state.dictionary;
}

/** 清掉用户覆盖，回到内置字典。 */
export async function resetDictionary(): Promise<void> {
  await browser.storage.local.remove(DICTIONARY_STORAGE_KEY);
  updateState(buildState(DEFAULT_DICTIONARY, false));
}

export function subscribeDictionary(listener: (state: DictionaryState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 订阅 storage 变化，实现「改字典即时生效」。
 *
 * 只挂在 background 与 sidepanel 这两个真正做匹配的上下文；content script
 * 只负责执行填值（不跑标签匹配），因此它不订阅，页面重载时自然拿到新字典。
 */
export function watchDictionaryStorage(): () => void {
  const handler = (
    changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
    areaName: string,
  ) => {
    if (areaName !== 'local' || !(DICTIONARY_STORAGE_KEY in changes)) {
      return;
    }
    const next = changes[DICTIONARY_STORAGE_KEY]?.newValue;
    if (next === undefined || next === null) {
      updateState(buildState(DEFAULT_DICTIONARY, false));
      return;
    }
    updateState(buildState(next, true));
  };
  browser.storage.onChanged.addListener(handler);
  return () => {
    browser.storage.onChanged.removeListener(handler);
  };
}
