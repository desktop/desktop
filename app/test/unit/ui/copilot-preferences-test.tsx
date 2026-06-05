import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { render, screen, fireEvent } from '../../helpers/ui/render'
import { CopilotPreferences } from '../../../src/ui/preferences/copilot'
import {
  DefaultCopilotModel,
  type CopilotFeature,
} from '../../../src/lib/stores/copilot-store'
import type { ModelInfo } from '@github/copilot-sdk'
import {
  encodeModelKey,
  type IBYOKProvider,
} from '../../../src/lib/copilot/byok'

function makeModel(
  overrides: Partial<ModelInfo> & Pick<ModelInfo, 'id' | 'name'>
): ModelInfo {
  return {
    capabilities: {
      supports: { vision: false, reasoningEffort: false },
      limits: { max_context_window_tokens: 128000 },
    },
    ...overrides,
  }
}

const defaultModel = makeModel({
  id: DefaultCopilotModel,
  name: 'GPT-5 mini',
  billing: { multiplier: 1 },
})

const otherModel = makeModel({
  id: 'claude-sonnet',
  name: 'Claude Sonnet',
  billing: { multiplier: 2 },
})

const models: ReadonlyArray<ModelInfo> = [defaultModel, otherModel]

const ollamaProvider: IBYOKProvider = {
  id: 'ollama-id',
  name: 'Ollama',
  type: 'openai',
  baseUrl: 'http://localhost:11434/v1',
  authKind: 'none',
  models: [
    { id: 'llama3', name: 'Llama 3' },
    { id: 'phi-4', name: 'Phi 4' },
  ],
}

function defaults() {
  return {
    selectedCopilotModels: {},
    copilotModels: models,
    copilotAvailable: true,
    byokProviders: [],
    showBYOKSettings: false,
    alwaysUseCopilotForConflictResolution: false,
    onSelectedCopilotModelChanged: () => {},
    onAlwaysUseCopilotForConflictResolutionChanged: () => {},
    onAddBYOKProvider: () => {},
    onEditBYOKProvider: () => {},
    onDeleteBYOKProvider: () => {},
  }
}

describe('CopilotPreferences', () => {
  it('shows sign-in message when copilot is not available', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        copilotModels={null}
        copilotAvailable={false}
      />
    )

    assert.ok(
      screen.getByText(
        'Sign in to a GitHub.com account in the Accounts tab to configure Copilot settings.'
      )
    )
    assert.strictEqual(screen.queryByRole('combobox'), null)
  })

  it('shows loading message when models not yet fetched', () => {
    render(<CopilotPreferences {...defaults()} copilotModels={null} />)
    assert.ok(screen.getByText('Loading available models…'))
  })

  it('shows no-models message when fetch completed with empty result', () => {
    render(<CopilotPreferences {...defaults()} copilotModels={[]} />)
    assert.ok(
      screen.getByText('No models available. Check your Copilot subscription.')
    )
  })

  it('renders a Copilot optgroup with the available models', () => {
    const view = render(<CopilotPreferences {...defaults()} />)

    const optgroups = view.container.querySelectorAll('optgroup')
    assert.strictEqual(optgroups.length, 1)
    assert.strictEqual(optgroups[0].label, 'GitHub Copilot')

    const options = view.container.querySelectorAll('option')
    assert.strictEqual(options[0].textContent, 'GPT-5 mini (default)')
    assert.strictEqual(options[1].textContent, 'Claude Sonnet')
  })

  it('renders a BYOK optgroup per provider', () => {
    const view = render(
      <CopilotPreferences {...defaults()} byokProviders={[ollamaProvider]} />
    )
    const labels = Array.from(view.container.querySelectorAll('optgroup')).map(
      g => g.label
    )
    assert.deepStrictEqual(labels, ['GitHub Copilot', 'Ollama'])
  })

  it('selects the default Copilot model when no model is selected', () => {
    const view = render(<CopilotPreferences {...defaults()} />)
    const select = view.container.querySelector('select') as HTMLSelectElement
    assert.strictEqual(
      select.value,
      encodeModelKey({ kind: 'copilot', modelId: DefaultCopilotModel })
    )
  })

  it('treats legacy bare-string selections as Copilot models', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        selectedCopilotModels={{ 'commit-message-generation': 'claude-sonnet' }}
      />
    )
    const select = view.container.querySelector('select') as HTMLSelectElement
    assert.strictEqual(
      select.value,
      encodeModelKey({ kind: 'copilot', modelId: 'claude-sonnet' })
    )
  })

  it('selects the matching BYOK option when chosen', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        byokProviders={[ollamaProvider]}
        selectedCopilotModels={{
          'commit-message-generation': encodeModelKey({
            kind: 'byok',
            providerId: ollamaProvider.id,
            modelId: 'llama3',
          }),
        }}
      />
    )
    const select = view.container.querySelector('select') as HTMLSelectElement
    assert.strictEqual(
      select.value,
      encodeModelKey({
        kind: 'byok',
        providerId: ollamaProvider.id,
        modelId: 'llama3',
      })
    )
  })

  it('emits the encoded composite key on change', () => {
    const changed: Array<{ feature: CopilotFeature; model: string | null }> = []
    const view = render(
      <CopilotPreferences
        {...defaults()}
        onSelectedCopilotModelChanged={(f, m) =>
          changed.push({ feature: f, model: m })
        }
      />
    )
    const select = view.container.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, {
      target: {
        value: encodeModelKey({ kind: 'copilot', modelId: 'claude-sonnet' }),
      },
    })
    assert.deepStrictEqual(changed, [
      {
        feature: 'commit-message-generation',
        model: encodeModelKey({ kind: 'copilot', modelId: 'claude-sonnet' }),
      },
    ])
  })

  it('emits the selected value directly on change', () => {
    const changed: Array<{ feature: CopilotFeature; model: string | null }> = []
    const view = render(
      <CopilotPreferences
        {...defaults()}
        selectedCopilotModels={{ 'commit-message-generation': 'claude-sonnet' }}
        onSelectedCopilotModelChanged={(f, m) =>
          changed.push({ feature: f, model: m })
        }
      />
    )
    const select = view.container.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, {
      target: {
        value: encodeModelKey({
          kind: 'copilot',
          modelId: DefaultCopilotModel,
        }),
      },
    })
    assert.deepStrictEqual(changed, [
      {
        feature: 'commit-message-generation',
        model: encodeModelKey({
          kind: 'copilot',
          modelId: DefaultCopilotModel,
        }),
      },
    ])
  })

  it('falls back to the default Copilot model when persisted selection is not in the model list', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        selectedCopilotModels={{
          'commit-message-generation': 'deleted-model',
        }}
      />
    )
    const select = view.container.querySelector('select') as HTMLSelectElement
    assert.strictEqual(
      select.value,
      encodeModelKey({ kind: 'copilot', modelId: DefaultCopilotModel })
    )
  })

  it('falls back to the default Copilot model when the BYOK provider for the persisted selection is gone', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        selectedCopilotModels={{
          'commit-message-generation': encodeModelKey({
            kind: 'byok',
            providerId: 'missing-provider',
            modelId: 'llama3',
          }),
        }}
      />
    )
    const select = view.container.querySelector('select') as HTMLSelectElement
    assert.strictEqual(
      select.value,
      encodeModelKey({ kind: 'copilot', modelId: DefaultCopilotModel })
    )
  })

  it('falls back to the first available Copilot model when DefaultCopilotModel is unavailable', () => {
    const onlyOtherModel = [otherModel]
    const view = render(
      <CopilotPreferences
        {...defaults()}
        copilotModels={onlyOtherModel}
        selectedCopilotModels={{
          'commit-message-generation': 'deleted-model',
        }}
      />
    )
    const select = view.container.querySelector('select') as HTMLSelectElement
    assert.strictEqual(
      select.value,
      encodeModelKey({ kind: 'copilot', modelId: otherModel.id })
    )
  })

  it('falls back to the first BYOK model when no Copilot models are available', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        copilotModels={[]}
        byokProviders={[ollamaProvider]}
        selectedCopilotModels={{
          'commit-message-generation': 'deleted-model',
        }}
      />
    )
    const select = view.container.querySelector('select') as HTMLSelectElement
    assert.strictEqual(
      select.value,
      encodeModelKey({
        kind: 'byok',
        providerId: ollamaProvider.id,
        modelId: ollamaProvider.models[0].id,
      })
    )
  })

  it('hides the Providers tab when showBYOKSettings is false', () => {
    const view = render(<CopilotPreferences {...defaults()} />)
    const tabs = view.container.querySelectorAll('[role="tab"]')
    assert.strictEqual(tabs.length, 0)
  })

  it('shows the Providers tab when enabled', () => {
    const view = render(
      <CopilotPreferences {...defaults()} showBYOKSettings={true} />
    )
    const tabs = view.container.querySelectorAll('[role="tab"]')
    const providersTab = Array.from(tabs).find(t =>
      (t.textContent ?? '').toLowerCase().includes('providers')
    )
    assert.ok(providersTab)
  })

  it('invokes onAddBYOKProvider when the Add button is clicked', () => {
    let called = 0
    const view = render(
      <CopilotPreferences
        {...defaults()}
        showBYOKSettings={true}
        onAddBYOKProvider={() => {
          called += 1
        }}
      />
    )
    const tabs = view.container.querySelectorAll('[role="tab"]')
    const providersTab = Array.from(tabs).find(t =>
      (t.textContent ?? '').toLowerCase().includes('providers')
    )
    assert.ok(providersTab)
    fireEvent.click(providersTab!)
    const buttons = view.container.querySelectorAll('button')
    const addButton = Array.from(buttons).find(b =>
      (b.textContent ?? '').toLowerCase().includes('add provider')
    )
    assert.ok(addButton)
    fireEvent.click(addButton!)
    assert.strictEqual(called, 1)
  })

  describe('conflict resolution model picker', () => {
    const previousPreviewFeatures = process.env.GITHUB_DESKTOP_PREVIEW_FEATURES

    function withConflictResolutionEnabled(enabled: boolean, fn: () => void) {
      if (enabled) {
        process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = '1'
      } else {
        delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
      }
      try {
        fn()
      } finally {
        if (previousPreviewFeatures === undefined) {
          delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
        } else {
          process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = previousPreviewFeatures
        }
      }
    }

    it('is hidden when the feature flag is disabled', () => {
      withConflictResolutionEnabled(false, () => {
        const view = render(<CopilotPreferences {...defaults()} />)
        const selects = view.container.querySelectorAll('select')
        assert.strictEqual(selects.length, 1)
      })
    })

    it('renders a second picker when the feature flag is enabled', () => {
      withConflictResolutionEnabled(true, () => {
        const view = render(<CopilotPreferences {...defaults()} />)
        const selects = view.container.querySelectorAll('select')
        assert.strictEqual(selects.length, 2)
      })
    })

    it('emits the conflict-resolution feature on change', () => {
      withConflictResolutionEnabled(true, () => {
        const changed: Array<{
          feature: CopilotFeature
          model: string | null
        }> = []
        const view = render(
          <CopilotPreferences
            {...defaults()}
            onSelectedCopilotModelChanged={(f, m) =>
              changed.push({ feature: f, model: m })
            }
          />
        )
        const selects = view.container.querySelectorAll('select')
        const conflictSelect = selects[1] as HTMLSelectElement
        fireEvent.change(conflictSelect, {
          target: {
            value: encodeModelKey({
              kind: 'copilot',
              modelId: 'claude-sonnet',
            }),
          },
        })
        assert.deepStrictEqual(changed, [
          {
            feature: 'conflict-resolution',
            model: encodeModelKey({
              kind: 'copilot',
              modelId: 'claude-sonnet',
            }),
          },
        ])
      })
    })
  })
})
