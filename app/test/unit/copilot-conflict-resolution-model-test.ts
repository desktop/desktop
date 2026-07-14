import { describe, it } from 'node:test'
import assert from 'node:assert'
import type { Model } from '@github/copilot-sdk/dist/generated/rpc'
import { getConflictResolutionModelDisplay } from '../../src/lib/copilot/conflict-resolution-model'
import { encodeModelKey, IBYOKProvider } from '../../src/lib/copilot/byok'

function makeModel(
  overrides: Partial<Model> & Pick<Model, 'id' | 'name'>
): Model {
  return {
    capabilities: {
      supports: { vision: false, reasoningEffort: false },
      limits: { max_context_window_tokens: 128000 },
    },
    ...overrides,
  }
}

const defaultModel = makeModel({
  id: 'auto',
  name: 'Auto',
  supportedReasoningEfforts: ['low', 'medium', 'high'],
})

const opus = makeModel({
  id: 'claude-opus',
  name: 'Claude Opus',
  supportedReasoningEfforts: ['high', 'xhigh'],
})

const noEffortModel = makeModel({ id: 'plain', name: 'Plain' })

const copilotModels = [defaultModel, opus, noEffortModel]

const byokProvider: IBYOKProvider = {
  id: 'provider-1',
  name: 'My Provider',
  type: 'openai',
  baseUrl: 'https://api.example.com/v1',
  authKind: 'apiKey',
  models: [
    {
      id: 'custom-a',
      name: 'Custom A (Deep reasoning)',
      reasoningEffort: 'high',
    },
  ],
}

describe('getConflictResolutionModelDisplay', () => {
  it('falls back to the default model and effort when nothing is selected', () => {
    const result = getConflictResolutionModelDisplay(null, copilotModels, [])
    assert.deepStrictEqual(result, {
      modelName: 'Auto',
      reasoningEffort: 'medium',
    })
  })

  it('omits the effort when the model list has not loaded', () => {
    const result = getConflictResolutionModelDisplay(null, null, [])
    assert.deepStrictEqual(result, {
      modelName: 'Auto',
      reasoningEffort: undefined,
    })
  })

  it('clamps the effort to one the selected model supports', () => {
    const selection = encodeModelKey({
      kind: 'copilot',
      modelId: 'claude-opus',
    })
    const result = getConflictResolutionModelDisplay(
      selection,
      copilotModels,
      []
    )
    // Opus does not support 'medium' (the default), so falls back to its
    // lowest supported effort ('high').
    assert.deepStrictEqual(result, {
      modelName: 'Claude Opus',
      reasoningEffort: 'high',
    })
  })

  it('omits the effort when the selected model has no reasoning support', () => {
    const selection = encodeModelKey({ kind: 'copilot', modelId: 'plain' })
    const result = getConflictResolutionModelDisplay(
      selection,
      copilotModels,
      []
    )
    assert.deepStrictEqual(result, {
      modelName: 'Plain',
      reasoningEffort: undefined,
    })
  })

  it('omits the effort when the selected built-in model is not in the list', () => {
    const selection = encodeModelKey({ kind: 'copilot', modelId: 'gone' })
    const result = getConflictResolutionModelDisplay(
      selection,
      copilotModels,
      []
    )
    assert.deepStrictEqual(result, {
      modelName: 'gone',
      reasoningEffort: undefined,
    })
  })

  it('strips the reasoning marker but keeps other markers, with the effort', () => {
    const reasoningVariant = makeModel({
      id: 'opus-high',
      name: 'Claude Opus 4.7 (High reasoning)(Internal only)',
      supportedReasoningEfforts: ['high'],
    })
    const selection = encodeModelKey({ kind: 'copilot', modelId: 'opus-high' })
    const result = getConflictResolutionModelDisplay(
      selection,
      [reasoningVariant],
      []
    )
    assert.deepStrictEqual(result, {
      modelName: 'Claude Opus 4.7 (Internal only)',
      reasoningEffort: 'high',
    })
  })

  it('shows BYOK model names verbatim and passes through the effort', () => {
    const selection = encodeModelKey({
      kind: 'byok',
      providerId: 'provider-1',
      modelId: 'custom-a',
    })
    const result = getConflictResolutionModelDisplay(selection, copilotModels, [
      byokProvider,
    ])
    // BYOK names are user-provided, so the "(Deep reasoning)" marker is kept.
    assert.deepStrictEqual(result, {
      modelName: 'Custom A (Deep reasoning)',
      reasoningEffort: 'high',
    })
  })

  it('falls back to the default model when the BYOK selection is missing', () => {
    const selection = encodeModelKey({
      kind: 'byok',
      providerId: 'deleted',
      modelId: 'gone',
    })
    const result = getConflictResolutionModelDisplay(
      selection,
      copilotModels,
      []
    )
    assert.deepStrictEqual(result, {
      modelName: 'Auto',
      reasoningEffort: 'medium',
    })
  })
})
