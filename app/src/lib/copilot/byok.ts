import { isIPv4 } from 'net'
import { TokenStore } from '../stores/token-store'
import type { ReasoningEffort } from '../stores/copilot-store'

/** Provider type understood by the Copilot SDK BYOK config. */
export type BYOKProviderType = 'openai' | 'azure' | 'anthropic'

/** OpenAI-compatible wire API format. */
export type BYOKWireApi = 'completions' | 'responses'

/**
 * Authentication mode used by a BYOK provider. `none` is allowed for local
 * providers like Ollama.
 */
export type BYOKAuthKind = 'apiKey' | 'bearer' | 'none'

/**
 * A user-declared model offered by a BYOK provider. Because we don't probe
 * the provider's `/models` endpoint, the user supplies the metadata.
 */
export interface IBYOKModel {
  /** Model ID sent to the provider (e.g. `gpt-4o`, `llama3`). */
  readonly id: string
  /** Human-readable name shown in the UI. */
  readonly name: string
  /**
   * The reasoning effort to send when invoking this model. Set for reasoning
   * models that support an explicit thinking effort (`o1`, `o3`, GPT-5
   * reasoning variants, etc.); leave undefined for non-reasoning models.
   */
  readonly reasoningEffort?: ReasoningEffort
}

/**
 * A user-configured Copilot model provider. Secrets (API key / bearer token)
 * are stored separately in the OS keychain and never persisted on this object.
 */
export interface IBYOKProvider {
  /** Stable identifier (UUID) used as the keychain login and option key. */
  readonly id: string
  /** Human-readable provider name shown in settings and dropdowns. */
  readonly name: string
  /** Provider type, mapped directly to the SDK's `ProviderConfig.type`. */
  readonly type: BYOKProviderType
  /** API endpoint URL. */
  readonly baseUrl: string
  /** Wire API format (openai/azure only). */
  readonly wireApi?: BYOKWireApi
  /** Azure-specific API version override. */
  readonly azureApiVersion?: string
  /** How the provider is authenticated. */
  readonly authKind: BYOKAuthKind
  /**
   * Optional per-provider request timeout in seconds. Used as the timeout
   * for SDK calls that target this provider (e.g. commit message generation).
   * When omitted the global Copilot default is used.
   */
  readonly requestTimeoutSeconds?: number
  /** Models exposed by this provider. */
  readonly models: ReadonlyArray<IBYOKModel>
}

const ProvidersStorageKey = 'copilot-byok-providers'
const TokenStoreKey = `${
  __DEV__ ? 'GitHub Desktop Dev' : 'GitHub Desktop'
} - Copilot BYOK provider`

/**
 * Loads the list of BYOK providers from local storage. Returns an empty list
 * if nothing has been configured or the stored value is malformed.
 */
export function loadBYOKProviders(): ReadonlyArray<IBYOKProvider> {
  const raw = localStorage.getItem(ProvidersStorageKey)
  if (raw === null) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(isBYOKProvider)
  } catch {
    return []
  }
}

/** Persists the given list of BYOK providers to local storage. */
export function saveBYOKProviders(
  providers: ReadonlyArray<IBYOKProvider>
): void {
  if (providers.length === 0) {
    localStorage.removeItem(ProvidersStorageKey)
    return
  }
  localStorage.setItem(ProvidersStorageKey, JSON.stringify(providers))
}

/**
 * Returns the API key / bearer token stored in the OS keychain for the
 * given provider, or null if none has been stored.
 */
export function getBYOKSecret(providerId: string): Promise<string | null> {
  return TokenStore.getItem(TokenStoreKey, providerId)
}

/** Stores the given secret in the OS keychain for the given provider. */
export function setBYOKSecret(
  providerId: string,
  secret: string
): Promise<void> {
  return TokenStore.setItem(TokenStoreKey, providerId, secret)
}

/** Removes any secret stored in the OS keychain for the given provider. */
export function deleteBYOKSecret(providerId: string): Promise<boolean> {
  return TokenStore.deleteItem(TokenStoreKey, providerId)
}

/**
 * Composite model identifier persisted in `selectedCopilotModels`. Wraps
 * either a built-in Copilot model or a BYOK provider+model pair so that
 * a single feature can pick from any source.
 */
export type CopilotModelKey =
  | { readonly kind: 'copilot'; readonly modelId: string }
  | {
      readonly kind: 'byok'
      readonly providerId: string
      readonly modelId: string
    }

const ByokKeyPrefix = 'byok:'
const CopilotKeyPrefix = 'copilot:'

/**
 * Encodes a {@link CopilotModelKey} to the string form that is persisted in
 * `selectedCopilotModels`.
 */
export function encodeModelKey(key: CopilotModelKey): string {
  if (key.kind === 'byok') {
    return `${ByokKeyPrefix}${key.providerId}:${key.modelId}`
  }
  return `${CopilotKeyPrefix}${key.modelId}`
}

/**
 * Parses a persisted model selection. Bare strings (without a prefix) are
 * treated as legacy Copilot model IDs so existing user settings continue
 * to work without an explicit migration step.
 */
export function parseModelKey(value: string): CopilotModelKey {
  if (value.startsWith(ByokKeyPrefix)) {
    const rest = value.slice(ByokKeyPrefix.length)
    const sep = rest.indexOf(':')
    if (sep > 0 && sep < rest.length - 1) {
      return {
        kind: 'byok',
        providerId: rest.slice(0, sep),
        modelId: rest.slice(sep + 1),
      }
    }
    // Malformed — fall through to copilot fallback so the feature degrades
    // to the default model rather than throwing.
    return { kind: 'copilot', modelId: '' }
  }

  if (value.startsWith(CopilotKeyPrefix)) {
    return { kind: 'copilot', modelId: value.slice(CopilotKeyPrefix.length) }
  }

  return { kind: 'copilot', modelId: value }
}

/**
 * Returns true if saving a BYOK provider with the given new auth kind
 * requires the user to enter a fresh secret. We can rely on the previously
 * stored secret only when editing an existing provider that already used
 * the same auth kind; switching auth kinds (or adding a new provider)
 * requires a new credential because the keychain entry is missing or
 * shaped wrong for the new kind.
 */
export function requiresNewBYOKSecret(
  newAuthKind: BYOKAuthKind,
  existingProvider: IBYOKProvider | null
): boolean {
  if (newAuthKind === 'none') {
    return false
  }
  if (existingProvider === null) {
    return true
  }
  return existingProvider.authKind !== newAuthKind
}

/**
 * Returns true if the given base URL points at the local machine. Used to
 * surface a "Local" badge in the provider list. Recognises the entire IPv4
 * 127/8 loopback block as well as IPv6 loopback in bracketed and bare forms.
 */
export function isLocalBaseUrl(baseUrl: string): boolean {
  let hostname: string
  try {
    hostname = new URL(baseUrl).hostname
  } catch {
    return false
  }

  if (hostname === 'localhost') {
    return true
  }

  // URL parses [::1] back to '[::1]' on some platforms, '::1' on others.
  if (hostname === '::1' || hostname === '[::1]') {
    return true
  }

  // Any 127.0.0.0/8 address is loopback (RFC 1122 §3.2.1.3).
  if (isIPv4(hostname) && hostname.startsWith('127.')) {
    return true
  }

  return false
}

/**
 * Returns true if the given string parses as an absolute http:// or https://
 * URL. Used as the single source of truth for `baseUrl` validation in both
 * the dialog and the localStorage loader.
 *
 * `http://` is only accepted when the host is on the local machine (see
 * {@link isLocalBaseUrl}); sending an API key to an arbitrary remote host
 * over plaintext HTTP would leak the credential to anyone on the network
 * path.
 */
export function isValidBYOKBaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'https:') {
      return true
    }
    if (parsed.protocol === 'http:' && isLocalBaseUrl(value)) {
      return true
    }
    return false
  } catch {
    return false
  }
}

function isBYOKModel(value: unknown): value is IBYOKModel {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const m = value as Record<string, unknown>
  if (typeof m.id !== 'string' || typeof m.name !== 'string') {
    return false
  }
  if (
    m.reasoningEffort !== undefined &&
    m.reasoningEffort !== 'low' &&
    m.reasoningEffort !== 'medium' &&
    m.reasoningEffort !== 'high' &&
    m.reasoningEffort !== 'xhigh'
  ) {
    return false
  }
  return true
}

function isBYOKProvider(value: unknown): value is IBYOKProvider {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const p = value as Record<string, unknown>
  if (
    typeof p.id !== 'string' ||
    typeof p.name !== 'string' ||
    typeof p.baseUrl !== 'string' ||
    !isValidBYOKBaseUrl(p.baseUrl)
  ) {
    return false
  }
  if (p.type !== 'openai' && p.type !== 'azure' && p.type !== 'anthropic') {
    return false
  }
  if (
    p.authKind !== 'apiKey' &&
    p.authKind !== 'bearer' &&
    p.authKind !== 'none'
  ) {
    return false
  }
  if (
    p.wireApi !== undefined &&
    p.wireApi !== 'completions' &&
    p.wireApi !== 'responses'
  ) {
    return false
  }
  if (
    p.azureApiVersion !== undefined &&
    typeof p.azureApiVersion !== 'string'
  ) {
    return false
  }
  if (!Array.isArray(p.models) || !p.models.every(isBYOKModel)) {
    return false
  }
  if (
    p.requestTimeoutSeconds !== undefined &&
    (typeof p.requestTimeoutSeconds !== 'number' ||
      !Number.isFinite(p.requestTimeoutSeconds) ||
      p.requestTimeoutSeconds <= 0)
  ) {
    return false
  }
  return true
}
