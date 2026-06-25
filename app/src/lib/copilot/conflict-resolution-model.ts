import type { Model } from '@github/copilot-sdk/dist/generated/rpc'
import {
  DefaultConflictResolutionReasoningEffort,
  getPreferredDefaultModel,
  getSupportedReasoningEffort,
  type ReasoningEffort,
} from '../stores/copilot-store'
import { IBYOKProvider, parseModelKey } from './byok'

/** Fallback name shown before the Copilot model list has loaded. */
const DefaultCopilotModelName = 'Auto'

/** The model name and reasoning effort to display for conflict resolution. */
export interface IConflictResolutionModelDisplay {
  readonly modelName: string
  readonly reasoningEffort: ReasoningEffort | undefined
}

/**
 * Resolves the stored `conflict-resolution` selection into the model name and
 * reasoning effort the engine will actually use, so the loading dialog header
 * matches. Mirrors `resolveConflictModelConfig`/`resolveCopilotModelRequest`:
 * BYOK passes through, built-in clamps the effort and falls back to the default
 * model, and the name is normalized for display.
 */
export function getConflictResolutionModelDisplay(
  selection: string | null,
  copilotModels: ReadonlyArray<Model> | null,
  byokProviders: ReadonlyArray<IBYOKProvider>
): IConflictResolutionModelDisplay {
  const key = selection !== null ? parseModelKey(selection) : null

  if (key?.kind === 'byok') {
    const provider = byokProviders.find(p => p.id === key.providerId)
    const model = provider?.models.find(m => m.id === key.modelId)
    if (model !== undefined) {
      // BYOK names are user-provided, so show them verbatim.
      return { modelName: model.name, reasoningEffort: model.reasoningEffort }
    }
    // Deleted provider/model — fall back to the default built-in model below.
  }

  const requestedModelId =
    key?.kind === 'copilot' && key.modelId !== '' ? key.modelId : null
  const models = copilotModels ?? []
  const resolvedModel = requestedModelId
    ? models.find(m => m.id === requestedModelId) ?? null
    : getPreferredDefaultModel(models)

  if (resolvedModel !== null) {
    return {
      modelName: cleanModelName(resolvedModel.name),
      reasoningEffort: getSupportedReasoningEffort(
        resolvedModel,
        DefaultConflictResolutionReasoningEffort
      ),
    }
  }

  // Metadata unavailable (list not loaded, or selection no longer offered):
  // mirror the engine — fall back to the requested id or default model, and
  // omit the effort since we can't confirm the model supports it.
  return {
    modelName: requestedModelId ?? DefaultCopilotModelName,
    reasoningEffort: undefined,
  }
}

/**
 * Strips the redundant "(... reasoning ...)" marker from a model name (the
 * effort is shown separately) while preserving other markers like
 * "(Internal only)".
 */
function cleanModelName(name: string): string {
  return name
    .replace(/\s*\([^)]*reasoning[^)]*\)/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
