import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { matchSlotWithAdapters } from '../../../shared/apply/adapters';
import {
  exportDictionary,
  getDictionary,
  hydrateDictionary,
  importDictionary,
  resetDictionary,
  subscribeDictionary,
  watchDictionaryStorage,
} from '../../../shared/dictionary/store';

/**
 * store 的状态是模块级的，所以隔离靠**显式重置**而不是 `vi.resetModules()`。
 *
 * 实测结论（别改回去）：`vi.resetModules()` 只对**字面量**说明符的 `import()`
 * 生效。用 `const p = '...'; import(p)` 这种变量说明符时它不重建模块，于是
 * store 与 adapters 共享同一个实例——那是巧合而不是设计，用例顺序一变就会崩，
 * 而且拿不到类型（tsc 报 implicit any）。这里改成静态导入 + `resetDictionary()`
 * 把状态推回内置字典，行为完全确定。
 */
const CUSTOM_DICTIONARY = {
  version: 1,
  adapters: [
    {
      id: 'custom',
      label: '自定义词典',
      enabled: true,
      // 「绝密暗号」在内置字典里没有任何模式命中，用它判别到底用的是哪份字典。
      patterns: { email: [{ match: '绝密暗号', mode: 'substring' }] },
    },
  ],
  enums: {},
  synonyms: [],
  options: { gender: ['男', '女'] },
};

beforeEach(async () => {
  fakeBrowser.reset();
  // 清掉 storage 覆盖并把缓存重建成内置字典，让每个用例从同一个起点出发。
  await resetDictionary();
});

describe('getDictionary', () => {
  it('可以同步调用，且回到内置字典时没有编译问题', () => {
    const state = getDictionary();

    expect(() => getDictionary()).not.toThrow();
    expect(state.customized).toBe(false);
    expect(state.adapters.map((a) => a.id)).toEqual(['en_default', 'zh_cn']);
    expect(state.issues).toEqual([]);
    expect(state.options.gender).toEqual(['男', '女']);
  });
});

describe('hydrateDictionary', () => {
  it('storage 里没有覆盖时保持内置字典', async () => {
    await hydrateDictionary(true);

    expect(getDictionary().customized).toBe(false);
    expect(getDictionary().adapters.map((a) => a.id)).toEqual(['en_default', 'zh_cn']);
  });

  it('storage 里有覆盖时用它，并且适配器那边真的看到新字典', async () => {
    await fakeBrowser.storage.local.set({ 'dictionary:v1': CUSTOM_DICTIONARY });

    await hydrateDictionary(true);

    const state = getDictionary();
    expect(state.customized).toBe(true);
    expect(state.adapters.map((a) => a.id)).toEqual(['custom']);
    // 这条断言是「模块级缓存确实被所有匹配调用方共享」的证据：
    // matchSlotWithAdapters 在另一个模块里，它必须看到 store 水合出来的状态。
    expect(matchSlotWithAdapters('绝密暗号')).toBe('email');
    expect(matchSlotWithAdapters('姓名')).toBeNull();
  });

  it('storage 里是垃圾数据时整份退回内置，且不 reject', async () => {
    await fakeBrowser.storage.local.set({ 'dictionary:v1': 42 });

    await expect(hydrateDictionary(true)).resolves.toBeTruthy();

    const state = getDictionary();
    expect(state.customized).toBe(false);
    expect(state.adapters.map((a) => a.id)).toEqual(['en_default', 'zh_cn']);
    expect(state.issues.length).toBeGreaterThan(0);
  });

  it('单条坏正则只失效这一条，其余照常用', async () => {
    await fakeBrowser.storage.local.set({
      'dictionary:v1': {
        version: 1,
        adapters: [
          {
            id: 'broken',
            enabled: true,
            patterns: {
              email: [{ match: '(', mode: 'regex' }, { match: '校园邮箱', mode: 'substring' }],
            },
          },
        ],
      },
    });

    await hydrateDictionary(true);

    expect(getDictionary().issues.some((issue) => issue.adapterId === 'broken')).toBe(true);
    // 坏的那条被跳过，好的那条仍然可以匹配
    expect(matchSlotWithAdapters('请填写校园邮箱', ['broken'])).toBe('email');
  });

  it('memo 命中时并发调用不再读 storage', async () => {
    await hydrateDictionary(true);
    const getSpy = vi.spyOn(fakeBrowser.storage.local, 'get');
    getSpy.mockClear();

    const [a, b] = await Promise.all([hydrateDictionary(), hydrateDictionary()]);

    expect(getSpy).not.toHaveBeenCalled();
    expect(a).toBe(b);
    getSpy.mockRestore();
  });

  it('force 时重新读一次 storage', async () => {
    await hydrateDictionary();
    const getSpy = vi.spyOn(fakeBrowser.storage.local, 'get');
    getSpy.mockClear();

    await hydrateDictionary(true);

    expect(getSpy).toHaveBeenCalledTimes(1);
    getSpy.mockRestore();
  });
});

describe('watchDictionaryStorage', () => {
  it('storage 变化时热更新，并通知订阅者', async () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeDictionary((state) => seen.push(state.customized));
    const stop = watchDictionaryStorage();

    try {
      await fakeBrowser.storage.local.set({ 'dictionary:v1': CUSTOM_DICTIONARY });
      await vi.waitFor(() => {
        expect(matchSlotWithAdapters('绝密暗号')).toBe('email');
      });
      expect(getDictionary().customized).toBe(true);
      expect(seen.length).toBeGreaterThan(0);

      // 删掉覆盖 -> 回到内置
      await fakeBrowser.storage.local.remove('dictionary:v1');
      await vi.waitFor(() => {
        expect(getDictionary().customized).toBe(false);
      });
      expect(matchSlotWithAdapters('姓名')).toBe('name');
    } finally {
      stop();
      unsubscribe();
    }
  });

  it('退订后不再收到通知', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDictionary(listener);
    const stop = watchDictionaryStorage();

    try {
      unsubscribe();
      await fakeBrowser.storage.local.set({ 'dictionary:v1': CUSTOM_DICTIONARY });
      await vi.waitFor(() => {
        expect(getDictionary().customized).toBe(true);
      });
      expect(listener).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });
});

describe('importDictionary / exportDictionary / resetDictionary', () => {
  it('导入成功后落盘并立即生效', async () => {
    const result = await importDictionary(CUSTOM_DICTIONARY);

    expect(result.errors).toEqual([]);
    expect(matchSlotWithAdapters('绝密暗号')).toBe('email');
    const stored = await fakeBrowser.storage.local.get('dictionary:v1');
    expect(stored['dictionary:v1']).toBeTruthy();
    expect(exportDictionary().adapters[0].id).toBe('custom');
  });

  it('一份没有任何可用适配器的字典会被拒绝写入', async () => {
    const result = await importDictionary({ version: 1, adapters: [] });

    expect(result.errors.length).toBeGreaterThan(0);
    const stored = await fakeBrowser.storage.local.get('dictionary:v1');
    expect(stored['dictionary:v1']).toBeUndefined();
    // 拒绝写入 = 线上仍然用内置字典
    expect(getDictionary().customized).toBe(false);
  });

  it('reset 之后回到内置字典并清掉 storage', async () => {
    await importDictionary(CUSTOM_DICTIONARY);

    await resetDictionary();

    expect(getDictionary().customized).toBe(false);
    expect(exportDictionary().adapters.map((a) => a.id)).toEqual(['en_default', 'zh_cn']);
    const stored = await fakeBrowser.storage.local.get('dictionary:v1');
    expect(stored['dictionary:v1']).toBeUndefined();
  });
});
