import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listAvailableAdapters } from '../../../shared/apply/adapters';
import {
  createDeepSeekProvider,
  getSettings,
  isAiConfigured,
  saveSettings,
} from '../../../shared/storage/settings';
import {
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
} from '../../../shared/llm/openaiCompatible';
import type { AppSettings, ProviderConfig } from '../../../shared/types';
import type { AdapterItem } from '../components/AdaptersCard';

/** DeepSeek 解析凭据。它只服务于「导入简历 → AI 解析」，不参与填表。 */
export interface DeepSeekConfigState {
  apiKey: string;
  model: string;
  apiBaseUrl: string;
  /** 「高级」折叠区是否展开，默认收起。 */
  showAdvanced?: boolean;
}

export interface UseSettingsResult {
  deepSeekConfig: DeepSeekConfigState;
  autoFallback: AppSettings['autoFallback'];
  highlightOverlay: boolean;
  fillMode: AppSettings['fillMode'];
  /** AI 解析是否可用（Key 已填）。UI 据此决定是直接解析还是先弹配置。 */
  aiConfigured: boolean;
  adapterItems: AdapterItem[];
  handleDeepSeekApiKeyChange: (value: string) => void;
  handleDeepSeekModelChange: (value: string) => void;
  handleDeepSeekApiBaseUrlChange: (value: string) => void;
  handleToggleAdapter: (id: string, checked: boolean) => void;
  handleAutoFallbackChange: (value: AppSettings['autoFallback']) => void;
  handleHighlightOverlayChange: (value: boolean) => void;
  handleFillModeChange: (value: AppSettings['fillMode']) => void;
}

const EMPTY_DEEPSEEK_CONFIG: DeepSeekConfigState = {
  apiKey: '',
  model: DEEPSEEK_DEFAULT_MODEL,
  apiBaseUrl: DEEPSEEK_DEFAULT_BASE_URL,
};

/**
 * 设置页的全部状态：AI 解析凭据 + 填表行为。
 *
 * 写入策略统一为「读最新快照 → 打补丁 → 整份保存」。旧实现每加一个字段就要给
 * `buildAppSettings` 多传一个参数，改一处忘一处就会把别的设置重置回默认值；
 * 快照式写法从结构上堵掉了这类 bug。
 */
interface UseSettingsParams {
  /** i18n 的宽松包装：内置适配器的展示名走 key，自定义适配器只有纯文本 label。 */
  translate: (key: string, substitutions?: unknown) => string;
}

export function useSettings({ translate }: UseSettingsParams): UseSettingsResult {
  const adapters = useMemo(() => listAvailableAdapters(), []);
  const defaultAdapterIds = useMemo(() => adapters.map((adapter) => adapter.id), [adapters]);

  const [deepSeekConfig, setDeepSeekConfig] = useState<DeepSeekConfigState>(EMPTY_DEEPSEEK_CONFIG);
  const [activeAdapters, setActiveAdapters] = useState<string[]>(defaultAdapterIds);
  const [autoFallback, setAutoFallback] = useState<AppSettings['autoFallback']>('skip');
  const [highlightOverlay, setHighlightOverlay] = useState(true);
  const [fillMode, setFillMode] = useState<AppSettings['fillMode']>('emptyOnly');

  const settingsRef = useRef<AppSettings | null>(null);
  const deepSeekConfigRef = useRef<DeepSeekConfigState>(EMPTY_DEEPSEEK_CONFIG);
  const defaultAdapterIdsRef = useRef<string[]>(defaultAdapterIds);
  defaultAdapterIdsRef.current = defaultAdapterIds;

  useEffect(() => {
    let mounted = true;
    void getSettings().then((loaded) => {
      if (!mounted) {
        return;
      }
      settingsRef.current = loaded;
      const nextDeepSeek: DeepSeekConfigState =
        loaded.provider.kind === 'deepseek'
          ? {
              apiKey: loaded.provider.apiKey,
              model: loaded.provider.model,
              apiBaseUrl: loaded.provider.apiBaseUrl,
            }
          : { ...EMPTY_DEEPSEEK_CONFIG };
      deepSeekConfigRef.current = nextDeepSeek;
      setDeepSeekConfig(nextDeepSeek);
      setActiveAdapters(loaded.adapters.length > 0 ? loaded.adapters : defaultAdapterIdsRef.current);
      setAutoFallback(loaded.autoFallback);
      setHighlightOverlay(loaded.highlightOverlay !== false);
      setFillMode(loaded.fillMode);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback((patch: Partial<AppSettings>) => {
    const base: AppSettings = settingsRef.current ?? {
      provider: { kind: 'none' },
      adapters: defaultAdapterIdsRef.current,
      autoFallback: 'skip',
      highlightOverlay: true,
      fillMode: 'emptyOnly',
    };
    const next: AppSettings = { ...base, ...patch };
    settingsRef.current = next;
    void saveSettings(next);
  }, []);

  /** 凭据 → provider 配置。没填 Key 就落回 `none`，避免存一个「半配置」的 provider。 */
  const providerFromConfig = useCallback((config: DeepSeekConfigState): ProviderConfig => {
    if (!config.apiKey.trim()) {
      return { kind: 'none' };
    }
    return createDeepSeekProvider(config.apiKey, config.model, config.apiBaseUrl);
  }, []);

  const updateDeepSeek = useCallback(
    (patch: Partial<DeepSeekConfigState>) => {
      const next = { ...deepSeekConfigRef.current, ...patch };
      deepSeekConfigRef.current = next;
      setDeepSeekConfig(next);
      persist({ provider: providerFromConfig(next) });
    },
    [persist, providerFromConfig],
  );

  const handleDeepSeekApiKeyChange = useCallback(
    (value: string) => updateDeepSeek({ apiKey: value }),
    [updateDeepSeek],
  );
  const handleDeepSeekModelChange = useCallback(
    (value: string) => updateDeepSeek({ model: value }),
    [updateDeepSeek],
  );
  const handleDeepSeekApiBaseUrlChange = useCallback(
    (value: string) => updateDeepSeek({ apiBaseUrl: value }),
    [updateDeepSeek],
  );

  const handleToggleAdapter = useCallback(
    (id: string, checked: boolean) => {
      const current = settingsRef.current?.adapters ?? defaultAdapterIdsRef.current;
      const next = checked
        ? Array.from(new Set([...current, id]))
        : current.filter((item) => item !== id);
      const resolved = next.length > 0 ? next : defaultAdapterIdsRef.current;
      setActiveAdapters(resolved);
      persist({ adapters: resolved });
    },
    [persist],
  );

  const handleAutoFallbackChange = useCallback(
    (value: AppSettings['autoFallback']) => {
      setAutoFallback(value);
      persist({ autoFallback: value });
    },
    [persist],
  );

  const handleFillModeChange = useCallback(
    (value: AppSettings['fillMode']) => {
      setFillMode(value);
      persist({ fillMode: value });
    },
    [persist],
  );

  const handleHighlightOverlayChange = useCallback(
    (value: boolean) => {
      setHighlightOverlay(value);
      persist({ highlightOverlay: value });
    },
    [persist],
  );

  const adapterItems = useMemo<AdapterItem[]>(
    () =>
      adapters.map((adapter) => ({
        id: adapter.id,
        // 内置适配器有 i18n key；字典里导入的自定义适配器只有纯文本 label。
        name: adapter.nameKey ? translate(adapter.nameKey) : (adapter.label ?? adapter.id),
        description: adapter.descriptionKey
          ? translate(adapter.descriptionKey)
          : (adapter.description ?? null),
        checked: activeAdapters.includes(adapter.id),
      })),
    [activeAdapters, adapters, translate],
  );

  const aiConfigured = useMemo(
    () => isAiConfigured(providerFromConfig(deepSeekConfig)),
    [deepSeekConfig, providerFromConfig],
  );

  return {
    deepSeekConfig,
    autoFallback,
    highlightOverlay,
    fillMode,
    aiConfigured,
    adapterItems,
    handleDeepSeekApiKeyChange,
    handleDeepSeekModelChange,
    handleDeepSeekApiBaseUrlChange,
    handleToggleAdapter,
    handleAutoFallbackChange,
    handleHighlightOverlayChange,
    handleFillModeChange,
  };
}
