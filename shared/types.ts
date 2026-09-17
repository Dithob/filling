import type { CnProfile } from './schema/cnProfile';

/**
 * 目前只有两档：
 *
 * - `none`（默认）：完全不联网。字段匹配与填值由本地字段字典完成，导入走规则解析。
 * - `deepseek`：**只用于导入简历时的 AI 解析**——把 PDF 文本转成 CnProfile JSON。
 *
 * AI 在填表链路里没有位置（那是字段字典的职责），所以这里不存在「填表时用哪个
 * 模型」这种概念。后续接别的厂商时，在 `shared/llm/openaiCompatible.ts` 加一个
 * preset 并在此处扩一个字面量即可——它们都兼容 OpenAI 协议。
 */
export type ProviderKind = 'none' | 'deepseek';

export interface NoneProviderConfig {
  kind: 'none';
}

export interface DeepSeekProviderConfig {
  kind: 'deepseek';
  apiKey: string;
  model: string;
  apiBaseUrl: string;
}

export type ProviderConfig = NoneProviderConfig | DeepSeekProviderConfig;

/** 解析当时的 provider 快照，只记型号不记密钥。 */
export type ProviderSnapshot =
  | NoneProviderConfig
  | {
      kind: 'deepseek';
      model: string;
      apiBaseUrl: string;
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
