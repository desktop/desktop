import type { CopilotClient } from '@github/copilot-sdk'

/**
 * Model metadata from the public RPC API, including picker fields not yet
 * exposed by the SDK's ModelInfo type.
 */
export type Model = Awaited<
  ReturnType<CopilotClient['rpc']['models']['list']>
>['models'][number]

/** A defined quota snapshot returned by the public SDK RPC API. */
export type AccountQuotaSnapshot = NonNullable<
  Awaited<
    ReturnType<CopilotClient['rpc']['account']['getQuota']>
  >['quotaSnapshots'][string]
>
