import type { CopilotClient, CopilotSession } from '@github/copilot-sdk'

/** Instruction metadata returned by the SDK's public session RPC API. */
export type InstructionSource = Awaited<
  ReturnType<CopilotSession['rpc']['instructions']['getSources']>
>['sources'][number]

/** Model metadata returned by the SDK's public RPC API. */
export type Model = Awaited<
  ReturnType<CopilotClient['rpc']['models']['list']>
>['models'][number]

/** Billing metadata for a model returned by the SDK. */
export type ModelBilling = NonNullable<Model['billing']>

/** Account quota snapshot returned by the SDK's public RPC API. */
export type AccountQuotaSnapshot = NonNullable<
  Awaited<
    ReturnType<CopilotClient['rpc']['account']['getQuota']>
  >['quotaSnapshots'][string]
>
