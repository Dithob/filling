import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

const STORE_PATH = '../../../shared/dictionary/store';

/** store 的状态是模块级的，每个用例都重新取一份模块，避免互相污染。 */
async function freshStore() {
  vi.resetModules();
  return import(STORE_PATH);
}

/** 取一份「干净的匹配器」：走同样的模块图，但只读当前缓存。 */
async function freshAdapters() {
  return import('../../../shared/apply/adapters');
}

const CUSTOM_DICTIONARY = {
  version: 1,
  adapters: [
    {
      id: 'custom',
      label: '自定义词典',
      enabled: true,
      // 「绝密暗号」在内置字典里没有任何模式命中，用它来判别到底用的是哪份字典。
      patterns: { email: [{ match: '绝密暗号', mode: 'substring' }] },
    },
  ],
  enums: {},
  synonyms: [],
  options: { gender: ['男', '女'] },
};

beforeEach(() => {
  fakeBrowser.reset();
});

describe('getDictionary 的初值', () => {
  it('未水合时就能同步拿到内置字典，且标记为未定制', async () => {
    const store = await freshStore();
    const state = store.getDictionary();

    expect(state.customized).toBe(false);
    expect(state.adapters.map((a) => a.id)).toEqual(['en_default', 'zh_cn']);
    // 内置字典是编译期就被编译好的，不该有水合期才暴露的问题
    expect(state.issues).toEqual([]);
    expect(state.options.gender).toEqual(['男', '女']);
  });
});

describe('hydrateDictionary', () => {
  it('storage 里没有覆盖时保持内置字典', async () => {
    const store = await freshStore();
    await store.hydrateDictionary();

    expect(store.getDictionary().customized).toBe(false);
    expect(store.getDictionary().adapters.map((a) => a.id)).toEqual(['en_default', 'zh_cn']);
  });

  it('storage 里有覆盖时用它，并且匹配真的走新字典', async () => {
    await fakeBrowser.storage.local.set({ 'dictionary:v1': CUSTOM_DICTIONARY });
    const store = await freshStore();
    const { matchSlotWithAdapters } = await freshAdapters();

    await store.hydrateDictionary();

    const state = store.getDictionary();
    expect(state.customized).toBe(true);
    expect(state.adapters.map((a) => a.id)).toEqual(['custom']);
    expect(matchSlotWithAdapters('绝密暗号')).toBe('email');
    // 内置的中文匹配器已经不在生效集合里了
    expect(matchSlotWithAdapters('姓名')).toBeNull();
  });

  it('storage 里是垃圾数据时整份退回内置，且不 reject', async () => {
    await fakeBrowser.storage.local.set({ 'dictionary:v1': 42 });
    const store = await freshStore();

    await expect(store.hydrateDictionary()).resolves.toBeTruthy();

    const state = store.getDictionary();
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
    const store = await freshStore();
    const { matchSlotWithAdapters } = await freshAdapters();

    await store.hydrateDictionary();

    expect(store.getDictionary().issues.some((issue) => issue.adapterId === 'broken')).toBe(true);
    // 坏的那条被跳过，好的那条仍然可以匹配
    expect(matchSlotWithAdapters('请填写校园邮箱', ['broken'])).toBe('email');
  });

  it('重复调用只读一次 storage', async () => {
    const store = await freshStore();
    const getSpy = vi.spyOn(fakeBrowser.storage.local, 'get');

    await Promise.all([store.hydrateDictionary(), store.hydrateDictionary()]);

    expect(getSpy).toHaveBeenCalledTimes(1);
    getSpy.mockRestore();
  });
});

describe('watchDictionaryStorage', () => {
  it('storage 变化时热更新，并通知订阅者', async () => {
    const store = await freshStore();
    const { matchSlotWithAdapters } = await freshAdapters();
    const seen: boolean[] = [];
    const unsubscribe = store.subscribeDictionary((state) => seen.push(state.customized));
    const stop = store.watchDictionaryStorage();

    await fakeBrowser.storage.local.set({ 'dictionary:v1': CUSTOM_DICTIONARY });
    await vi.waitFor(() => {
      expect(matchSlotWithAdapters('绝密暗号')).toBe('email');
    });

    expect(store.getDictionary().customized).toBe(true);
    expect(seen.length).toBeGreaterThan(0);

    // 删掉覆盖 -> 回到内置
    await fakeBrowser.storage.local.remove('dictionary:v1');
    await vi.waitFor(() => {
      expect(store.getDictionary().customized).toBe(false);
    });
    expect(matchSlotWithAdapters('姓名')).toBe('name');

    stop();
    unsubscribe();
  });

  it('退订后不再收到通知', async () => {
    const store = await freshStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribeDictionary(listener);

    unsubscribe();
    await fakeBrowser.storage.local.set({ 'dictionary:v1': CUSTOM_DICTIONARY });
    store.watchDictionaryStorage();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('importDictionary / exportDictionary / resetDictionary', () => {
  it('导入成功后落盘并立即生效', async () => {
    const store = await freshStore();
    const { matchSlotWithAdapters } = await freshAdapters();

    const result = await store.importDictionary(CUSTOM_DICTIONARY);

    expect(result.errors).toEqual([]);
    expect(matchSlotWithAdapters('绝密暗号')).toBe('email');
    const stored = await fakeBrowser.storage.local.get('dictionary:v1');
    expect(stored['dictionary:v1']).toBeTruthy();
    expect(store.exportDictionary().adapters[0].id).toBe('custom');
  });

  it('一份没有任何可用适配器的字典会被拒绝写入', async () => {
    const store = await freshStore();
    const result = await store.importDictionary({ version: 1, adapters: [] });

    expect(result.errors.length).toBeGreaterThan(0);
    const stored = await fakeBrowser.storage.local.get('dictionary:v1');
    expect(stored['dictionary:v1']).toBeUndefined();
    // 拒绝写入 = 线上仍然用内置字典
    expect(store.getDictionary().customized).toBe(false);
  });

  it('reset 之后回到内置字典并清掉 storage', async () => {
    const store = await freshStore();
    await store.importDictionary(CUSTOM_DICTIONARY);

    await store.resetDictionary();

    expect(store.getDictionary().customized).toBe(false);
    expect(store.exportDictionary().adapters.map((a) => a.id)).toEqual(['en_default', 'zh_cn']);
    const stored = await fakeBrowser.storage.local.get('dictionary:v1');
    expect(stored['dictionary:v1']).toBeUndefined();
  });
});
