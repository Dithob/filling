import type { CnProfile } from './schema/cnProfile';

export type ProviderKind = 'on-device' | 'openai' | 'gemini';

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

export type ProviderConfig = OnDeviceProviderConfig | OpenAIProviderConfig | GeminiProviderConfig;

export type ProviderSnapshot =
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
