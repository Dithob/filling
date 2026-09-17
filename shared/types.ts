import type { CnProfile } from './schema/cnProfile';

export type ProviderKind = 'none' | 'on-device' | 'openai' | 'gemini';

/**
 * 「不使用 AI」是默认档：字段匹配与填值全部由本地字段字典完成，不需要任何模型。
 * 需要 AI 的能力（识别未命中字段、生成开放题文案、PDF 智能解析）在选中它时
 * 要么隐藏、要么提示用户去开一个 provider。
 */
export interface NoneProviderConfig {
  kind: 'none';
}

export interface OnDeviceProviderConfig {
  kind: 'on-device';
}

export interface OpenAIProviderConfig {
  kind: 'openai';
  apiKey: string;
  model: string;
  apiBaseUrl: string;
}

export interface GeminiProviderConfig {
  kind: 'gemini';
  apiKey: string;
  model: string;
}

export type ProviderConfig =
  | NoneProviderConfig
  | OnDeviceProviderConfig
  | OpenAIProviderConfig
  | GeminiProviderConfig;

export type ProviderSnapshot =
  | NoneProviderConfig
  | OnDeviceProviderConfig
  | {
      kind: 'openai';
      model: string;
      apiBaseUrl: string;
    }
  | {
      kind: 'gemini';
      model: string;
    };

export interface StoredFileReference {
  name: string;
  type: string;
  size: number;
  storageKey: string;
}

export type ResumeExtractionResult = Record<string, unknown>;

/**
 * Stored profile. The flat Chinese schema (CnProfile) is the source of truth;
 * the extra fields are legacy metadata kept so existing UI can still render.
 */
export type ProfileRecord = CnProfile & {
  provider?: ProviderSnapshot;
  parsedAt?: string;
  validation?: {
    valid: boolean;
    errors?: string[];
  };
};

/** 批量填充策略：只填空（默认）或允许覆盖页面已有值。 */
export type FillMode = 'emptyOnly' | 'overwrite';

export interface AppSettings {
  provider: ProviderConfig;
  adapters: string[];
  autoFallback: 'skip' | 'pause';
  highlightOverlay: boolean;
  fillMode: FillMode;
}

export type ChatMessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
}
