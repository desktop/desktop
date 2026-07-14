import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '../../helpers/ui/render'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'
import { CopilotPreferences } from '../../../src/ui/preferences/copilot'
import {
  DefaultCopilotModel,
  type CopilotFeature,
} from '../../../src/lib/stores/copilot-store'
import {
  encodeModelKey,
  type IBYOKProvider,
} from '../../../src/lib/copilot/byok'
import { Account } from '../../../src/models/account'
import type { Model } from '@github/copilot-sdk/dist/generated/rpc'
import { setNumberFormatPreference } from '../../../src/models/formatting-preferences'

interface IAccountOptions {
  readonly isCopilotDesktopEnabled?: boolean
  readonly copilotLicenseType?: string
  readonly endpoint?: string
  readonly id?: number
  readonly login?: string
}

function makeAccount(options: IAccountOptions = {}): Account {
  const isCopilotDesktopEnabled =
    'isCopilotDesktopEnabled' in options
      ? options.isCopilotDesktopEnabled
      : true
  const copilotLicenseType =
    'copilotLicenseType' in options
      ? options.copilotLicenseType
      : 'COPILOT_INDIVIDUAL'

  return new Account(
    options.login ?? 'mona',
    options.endpoint ?? 'https://api.github.com',
    'token',
    [],
    '',
    options.id ?? 1,
    'Mona Lisa',
    'free',
    'https://copilot-proxy.githubusercontent.com',
    isCopilotDesktopEnabled,
    [],
    copilotLicenseType
  )
}

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
  id: DefaultCopilotModel,
  name: 'Auto',
  billing: { multiplier: 1 },
})

const otherModel = makeModel({
  id: 'claude-sonnet',
  name: 'Claude Sonnet',
  billing: { multiplier: 2 },
})

const usageBilledModel = makeModel({
  id: 'usage-billed-model',
  name: 'Usage Billed Model',
  capabilities: {
    supports: { vision: false, reasoningEffort: true },
    limits: { max_output_tokens: 64000 },
  },
  supportedReasoningEfforts: ['low', 'medium', 'high'],
  modelPickerCategory: 'lightweight',
  modelPickerPriceCategory: 'low',
  billing: {
    tokenPrices: {
      batchSize: 1500000,
      cachePrice: 20,
      contextMax: 1436000,
      inputPrice: 200,
      outputPrice: 1200,
    },
  },
})

const partiallyPricedModel = makeModel({
  id: 'partially-priced-model',
  name: 'Partially Priced Model',
  modelPickerCategory: 'lightweight',
  modelPickerPriceCategory: 'low',
  billing: {
    tokenPrices: {
      batchSize: 1000000,
      inputPrice: 200,
    },
  },
})

const missingBatchSizeModel = makeModel({
  id: 'missing-batch-size-model',
  name: 'Missing Batch Size Model',
  modelPickerCategory: 'lightweight',
  modelPickerPriceCategory: 'low',
  billing: {
    tokenPrices: {
      inputPrice: 200,
      outputPrice: 1200,
    },
  },
})

const models: ReadonlyArray<Model> = [
  defaultModel,
  otherModel,
  usageBilledModel,
]

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

class TestListResizeObserver implements ResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    Object.defineProperty(target, 'offsetWidth', {
      configurable: true,
      value: 365,
    })
    Object.defineProperty(target, 'offsetHeight', {
      configurable: true,
      value: 360,
    })

    const contentRect = {
      x: 0,
      y: 0,
      width: 365,
      height: 360,
      top: 0,
      right: 365,
      bottom: 360,
      left: 0,
      toJSON: () => ({}),
    }

    this.callback(
      [
        {
          target,
          contentRect,
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this
    )
  }

  public unobserve() {}

  public disconnect() {}
}

let hadGlobalResizeObserver = false
let originalGlobalResizeObserver: typeof ResizeObserver | undefined
let hadWindowResizeObserver = false
let originalWindowResizeObserver: typeof ResizeObserver | undefined

beforeEach(() => {
  hadGlobalResizeObserver = 'ResizeObserver' in globalThis
  originalGlobalResizeObserver = globalThis.ResizeObserver
  hadWindowResizeObserver =
    typeof window !== 'undefined' && 'ResizeObserver' in window
  originalWindowResizeObserver =
    typeof window !== 'undefined' ? window.ResizeObserver : undefined

  Object.assign(globalThis, { ResizeObserver: TestListResizeObserver })

  if (typeof window !== 'undefined') {
    Object.assign(window, { ResizeObserver: TestListResizeObserver })
  }
})

afterEach(() => {
  if (hadGlobalResizeObserver) {
    Object.assign(globalThis, { ResizeObserver: originalGlobalResizeObserver })
  } else {
    Reflect.deleteProperty(globalThis, 'ResizeObserver')
  }

  if (typeof window !== 'undefined') {
    if (hadWindowResizeObserver) {
      Object.assign(window, { ResizeObserver: originalWindowResizeObserver })
    } else {
      Reflect.deleteProperty(window, 'ResizeObserver')
    }
  }
})

function defaults() {
  return {
    selectedCopilotModels: {},
    copilotModels: models,
    accounts: [makeAccount()],
    byokProviders: [],
    showBYOKSettings: false,
    onSignIn: () => {},
    onOpenCopilotPlans: () => {},
    onOpenCopilotFeatureSettings: () => {},
    alwaysUseCopilotForConflictResolution: false,
    onSelectedCopilotModelChanged: () => {},
    onAlwaysUseCopilotForConflictResolutionChanged: () => {},
    onAddBYOKProvider: () => {},
    onEditBYOKProvider: () => {},
    onDeleteBYOKProvider: () => {},
  }
}

function getModelPickerButton(container: HTMLElement): HTMLButtonElement {
  const button = getModelPickerButtons(container)[0]

  assert.ok(button instanceof HTMLButtonElement)

  return button
}

function getModelPickerButtons(
  container: HTMLElement
): ReadonlyArray<HTMLButtonElement> {
  const buttons = container.querySelectorAll(
    '.copilot-model-picker > .button-component'
  )

  return Array.from(buttons).filter(
    (button): button is HTMLButtonElement => button instanceof HTMLButtonElement
  )
}

function getModelPickerButtonText(container: HTMLElement): string {
  return getModelPickerButton(container).textContent ?? ''
}

function getListItemHeight(element: HTMLElement): string {
  const row = element.closest('.list-item')
  assert.ok(row instanceof HTMLElement)

  return row.style.height
}

function assertElementTextContent(
  container: HTMLElement,
  selector: string,
  textContent: string
) {
  const element = Array.from(container.querySelectorAll(selector)).find(
    candidateElement => candidateElement.textContent === textContent
  )

  assert.ok(element instanceof HTMLElement)
}

function getCostDetailsValue(container: HTMLElement, label: string): string {
  const labelElement = within(container).getByText(label)
  const row = labelElement.closest('.copilot-model-picker-cost-details-row')
  assert.ok(row instanceof HTMLElement)

  const valueElement = row.querySelector('dd')
  assert.ok(valueElement instanceof HTMLElement)

  return valueElement.textContent ?? ''
}

describe('CopilotPreferences', () => {
  it('shows sign-in call to action when no account is available', () => {
    let called = 0

    render(
      <CopilotPreferences
        {...defaults()}
        copilotModels={null}
        accounts={[]}
        onSignIn={() => {
          called += 1
        }}
      />
    )

    assert.ok(
      screen.getByText(
        'Sign in to an account with a Copilot license to configure Copilot settings.'
      )
    )

    const signInButton = screen.getByRole('button', {
      name: 'Sign In',
    })
    fireEvent.click(signInButton)

    assert.strictEqual(called, 1)
    assert.strictEqual(screen.queryByRole('combobox'), null)
  })

  it('shows sign-in call to action when only GHES accounts are available', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        copilotModels={null}
        accounts={[
          makeAccount({
            endpoint: 'https://enterprise.example.com/api/v3',
            id: 2,
            login: 'octo',
            isCopilotDesktopEnabled: undefined,
            copilotLicenseType: undefined,
          }),
        ]}
      />
    )

    assert.ok(
      screen.getByText(
        'Sign in to an account with a Copilot license to configure Copilot settings.'
      )
    )
    assert.strictEqual(screen.queryByText('Checking Copilot access…'), null)
    assert.strictEqual(screen.queryByRole('combobox'), null)
  })

  it('shows checking message when Copilot account metadata has not loaded', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        accounts={[
          makeAccount({
            isCopilotDesktopEnabled: undefined,
            copilotLicenseType: undefined,
          }),
        ]}
      />
    )

    assert.ok(screen.getByText('Checking Copilot access…'))
    assert.strictEqual(screen.queryByRole('combobox'), null)
  })

  it('shows checking message when Copilot license metadata has not loaded', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        accounts={[
          makeAccount({
            isCopilotDesktopEnabled: true,
            copilotLicenseType: undefined,
          }),
        ]}
      />
    )

    assert.ok(screen.getByText('Checking Copilot access…'))
    assert.strictEqual(screen.queryByRole('combobox'), null)
  })

  it('opens Copilot plans when the user does not have a Copilot license', () => {
    let called = 0

    render(
      <CopilotPreferences
        {...defaults()}
        accounts={[
          makeAccount({
            copilotLicenseType: 'NO_ACCESS',
          }),
        ]}
        onOpenCopilotPlans={() => {
          called += 1
        }}
      />
    )

    assert.ok(
      screen.getByText(
        'Copilot features in GitHub Desktop require a GitHub Copilot license.'
      )
    )

    fireEvent.click(screen.getByRole('button', { name: 'View Copilot plans' }))

    assert.strictEqual(called, 1)
    assert.strictEqual(screen.queryByRole('combobox'), null)
  })

  it('opens Copilot feature settings when Desktop access is disabled', () => {
    let called = 0
    const view = render(
      <CopilotPreferences
        {...defaults()}
        accounts={[
          makeAccount({
            isCopilotDesktopEnabled: false,
          }),
        ]}
        showBYOKSettings={true}
        onOpenCopilotFeatureSettings={() => {
          called += 1
        }}
      />
    )

    assert.ok(
      screen.getByText(
        'A Copilot license is available for your account, but "Copilot in GitHub Desktop" is disabled in your Copilot feature settings.'
      )
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Open Copilot feature settings' })
    )

    assert.strictEqual(called, 1)
    assert.strictEqual(screen.queryByRole('combobox'), null)
    assert.strictEqual(
      view.container.querySelectorAll('[role="tab"]').length,
      0
    )
  })

  it('uses Copilot when a GHE account has Copilot enabled', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        accounts={[
          makeAccount({ copilotLicenseType: 'NO_ACCESS' }),
          makeAccount({
            endpoint: 'https://api.octocorp.ghe.com',
            id: 2,
            login: 'octo',
            isCopilotDesktopEnabled: true,
            copilotLicenseType: 'COPILOT_BUSINESS',
          }),
        ]}
      />
    )

    assert.ok(screen.getAllByRole('button', { name: /Auto/ }).length > 0)
    assert.strictEqual(screen.queryByText('View Copilot plans'), null)
  })

  it('ignores GHES accounts while checking Copilot access', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        accounts={[
          makeAccount({ copilotLicenseType: 'NO_ACCESS' }),
          makeAccount({
            endpoint: 'https://enterprise.example.com/api/v3',
            id: 2,
            login: 'octo',
            isCopilotDesktopEnabled: undefined,
            copilotLicenseType: undefined,
          }),
        ]}
      />
    )

    assert.ok(
      screen.getByText(
        'Copilot features in GitHub Desktop require a GitHub Copilot license.'
      )
    )
    assert.strictEqual(screen.queryByRole('combobox'), null)
    assert.strictEqual(screen.queryByText('Checking Copilot access…'), null)
  })

  it('shows loading message when models not yet fetched', () => {
    render(<CopilotPreferences {...defaults()} copilotModels={null} />)
    assert.ok(screen.getByText('Loading available models…'))
  })

  it('shows no-models message when fetch completed with empty result', () => {
    render(<CopilotPreferences {...defaults()} copilotModels={[]} />)
    assert.ok(screen.getByText('No Copilot models available.'))
  })

  it('renders a Copilot group with the available models', async () => {
    const view = render(<CopilotPreferences {...defaults()} />)
    const modelPickerButton = getModelPickerButton(view.container)
    const pickerLabel = __DARWIN__
      ? 'Commit Message Generation'
      : 'Commit message generation'

    assert.strictEqual(
      modelPickerButton.getAttribute('aria-label'),
      `${pickerLabel}: Auto (default)`
    )
    assert.strictEqual(modelPickerButton.getAttribute('aria-expanded'), 'false')
    assert.strictEqual(
      modelPickerButton.getAttribute('aria-haspopup'),
      'dialog'
    )
    assert.strictEqual(modelPickerButton.getAttribute('aria-controls'), null)

    fireEvent.click(modelPickerButton)

    await waitFor(() => assert.ok(screen.getByText('Claude Sonnet (2x)')))
    assert.strictEqual(modelPickerButton.getAttribute('aria-expanded'), 'true')

    const controlledContentId = modelPickerButton.getAttribute('aria-controls')
    assert.ok(controlledContentId !== null)

    const controlledContent = document.getElementById(controlledContentId)
    assert.ok(controlledContent instanceof HTMLElement)
    assert.ok(controlledContent.classList.contains('popover-dropdown-content'))

    assert.strictEqual(screen.queryByText('GitHub Copilot'), null)
    assert.ok(document.querySelector('.popover-component'))
    assert.strictEqual(document.querySelector('.popover-tip'), null)
    assert.ok(screen.getByText('Lightweight'))
    assert.ok(screen.getAllByText('Auto (default)').length >= 2)
    assert.ok(screen.getByText('Usage Billed Model'))
    assert.ok(screen.getByText('Use of credits: low'))
    assert.strictEqual(
      screen.queryByText('Usage Billed Model (low cost)'),
      null
    )
    assert.strictEqual(screen.queryByText('AI credits per 1M tokens'), null)
    assert.strictEqual(
      getListItemHeight(screen.getByText('Claude Sonnet (2x)')),
      '30px'
    )
    assert.strictEqual(
      getListItemHeight(screen.getByText('Usage Billed Model')),
      '46px'
    )
  })

  it('renders a BYOK group per provider', async () => {
    const view = render(
      <CopilotPreferences {...defaults()} byokProviders={[ollamaProvider]} />
    )

    fireEvent.click(getModelPickerButton(view.container))

    await waitFor(() => assert.ok(screen.getByText('Ollama')))
    assert.strictEqual(screen.queryByText('GitHub Copilot'), null)
  })

  it('selects the default Copilot model when no model is selected', () => {
    const view = render(<CopilotPreferences {...defaults()} />)

    assert.ok(
      getModelPickerButtonText(view.container).includes('Auto (default)')
    )
    assert.ok(
      !getModelPickerButtonText(view.container).includes('GitHub Copilot')
    )
  })

  it('shows usage billing below the selected model picker', async t => {
    enableTestTimers(['setTimeout'])
    t.after(resetTestTimers)
    const previousNumberFormat = localStorage.getItem('numberFormat')
    t.after(() => {
      if (previousNumberFormat === null) {
        localStorage.removeItem('numberFormat')
      } else {
        localStorage.setItem('numberFormat', previousNumberFormat)
      }
    })
    setNumberFormatPreference({
      thousandsSeparator: '.',
      decimalSeparator: ',',
    })

    const view = render(
      <CopilotPreferences
        {...defaults()}
        selectedCopilotModels={{
          'commit-message-generation': encodeModelKey({
            kind: 'copilot',
            modelId: 'usage-billed-model',
          }),
        }}
      />
    )

    const button = getModelPickerButton(view.container)

    assert.ok(within(button).getByText('Usage Billed Model'))
    assert.strictEqual(within(button).queryByText(/Use of credits/), null)
    assert.ok(screen.getByText('Lightweight model. Use of credits: low'))
    assert.strictEqual(screen.queryByText(/AI credits per/), null)
    assert.ok(!button.textContent?.includes('low cost'))

    const costsButtons = screen.getAllByRole('button', {
      name: 'Show Copilot model credit costs',
    })
    const costsButton = costsButtons[0]

    assert.strictEqual(costsButton.getAttribute('aria-expanded'), 'false')
    assert.strictEqual(costsButton.getAttribute('aria-controls'), null)
    assert.strictEqual(costsButton.getAttribute('aria-describedby'), null)

    fireEvent.click(costsButton)

    assert.strictEqual(costsButton.getAttribute('aria-expanded'), 'true')
    assert.strictEqual(screen.queryByRole('button', { name: 'Close' }), null)

    const costsPopover = view.container.querySelector(
      '.copilot-model-picker-cost-details'
    )
    assert.ok(costsPopover instanceof HTMLElement)
    assert.strictEqual(
      costsButton.getAttribute('aria-controls'),
      costsPopover.id
    )
    assert.strictEqual(
      costsButton.getAttribute('aria-describedby'),
      costsPopover.id
    )

    fireEvent.mouseEnter(costsButton, { clientX: 20, clientY: 20 })
    fireEvent.mouseMove(costsButton, { clientX: 20, clientY: 20 })
    advanceTimersBy(400)

    await waitFor(() => assert.ok(screen.getByText('Show credit costs')))
    assert.strictEqual(
      costsButton.getAttribute('aria-describedby'),
      costsPopover.id
    )

    assert.ok(within(costsPopover).getByText('Usage Billed Model'))
    assert.ok(within(costsPopover).getByText('Lightweight'))
    assert.ok(within(costsPopover).getByText('Context'))
    assert.strictEqual(getCostDetailsValue(costsPopover, 'Context'), '1,5m')
    assert.ok(within(costsPopover).getByText('Reasoning'))
    assert.ok(within(costsPopover).getByText('3 levels'))
    assertElementTextContent(costsPopover, 'h4', 'AI credits per 1,5m tokens')
    assert.ok(screen.getByText('Input'))
    assert.ok(screen.getByText('200'))
    assert.ok(screen.getByText('Cached input'))
    assert.ok(screen.getByText('20'))
    assert.ok(screen.getByText('Output'))
    assert.ok(screen.getByText('1.200'))

    fireEvent.keyDown(costsButton, { key: 'Escape' })

    assert.strictEqual(screen.queryByText('AI credits per 1M tokens'), null)
  })

  it('renders unavailable cost details for missing token prices', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        copilotModels={[partiallyPricedModel]}
        selectedCopilotModels={{
          'commit-message-generation': encodeModelKey({
            kind: 'copilot',
            modelId: 'partially-priced-model',
          }),
        }}
      />
    )

    assert.ok(
      screen.getAllByText('Lightweight model. Use of credits: low').length > 0
    )

    const costsButtons = screen.getAllByRole('button', {
      name: 'Show Copilot model credit costs',
    })
    const costsButton = costsButtons[0]
    fireEvent.click(costsButton)

    const costsPopover = view.container.querySelector(
      '.copilot-model-picker-cost-details'
    )
    assert.ok(costsPopover instanceof HTMLElement)

    assertElementTextContent(costsPopover, 'h4', 'AI credits per 1m tokens')
    assert.ok(within(costsPopover).getByText('200'))
    assert.strictEqual(
      within(costsPopover).getAllByText('Unavailable').length,
      2
    )
  })

  it('omits the cost details button when token batch size is missing', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        copilotModels={[missingBatchSizeModel]}
        selectedCopilotModels={{
          'commit-message-generation': encodeModelKey({
            kind: 'copilot',
            modelId: 'missing-batch-size-model',
          }),
        }}
      />
    )

    assert.ok(
      screen.getAllByText('Lightweight model. Use of credits: low').length > 0
    )
    assert.strictEqual(
      screen.queryByRole('button', {
        name: 'Show Copilot model credit costs',
      }),
      null
    )
    assert.strictEqual(screen.queryByText(/AI credits per/), null)
  })

  it('treats legacy bare-string selections as Copilot models', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        selectedCopilotModels={{ 'commit-message-generation': 'claude-sonnet' }}
      />
    )

    assert.ok(
      getModelPickerButtonText(view.container).includes('Claude Sonnet (2x)')
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

    const buttonText = getModelPickerButtonText(view.container)
    assert.ok(buttonText.includes('Llama 3'))
    assert.ok(!buttonText.includes('Ollama'))
  })

  it('emits the encoded composite key on change', async () => {
    const changed: Array<{ feature: CopilotFeature; model: string | null }> = []
    const view = render(
      <CopilotPreferences
        {...defaults()}
        onSelectedCopilotModelChanged={(f, m) =>
          changed.push({ feature: f, model: m })
        }
      />
    )

    fireEvent.click(getModelPickerButton(view.container))
    await waitFor(() => assert.ok(screen.getByText('Claude Sonnet (2x)')))
    fireEvent.click(screen.getByText('Claude Sonnet (2x)'))

    assert.deepStrictEqual(changed, [
      {
        feature: 'commit-message-generation',
        model: encodeModelKey({ kind: 'copilot', modelId: 'claude-sonnet' }),
      },
    ])
  })

  it('emits the selected value directly on change', async () => {
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

    fireEvent.click(getModelPickerButton(view.container))

    const defaultModelItem = await waitFor(() => {
      const popover = document.querySelector('.popover-dropdown-content')
      assert.ok(popover instanceof HTMLElement)
      return within(popover).getByText('Auto (default)')
    })

    fireEvent.click(defaultModelItem)

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

    assert.ok(
      getModelPickerButtonText(view.container).includes('Auto (default)')
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

    assert.ok(
      getModelPickerButtonText(view.container).includes('Auto (default)')
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

    assert.ok(
      getModelPickerButtonText(view.container).includes('Claude Sonnet (2x)')
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

    const buttonText = getModelPickerButtonText(view.container)
    assert.ok(buttonText.includes('Llama 3'))
    assert.ok(!buttonText.includes('Ollama'))
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
    it('renders both pickers', () => {
      const view = render(<CopilotPreferences {...defaults()} />)
      assert.strictEqual(getModelPickerButtons(view.container).length, 2)
    })

    it('emits the conflict-resolution feature on change', async () => {
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
      const buttons = getModelPickerButtons(view.container)
      const conflictPickerButton = buttons[1]
      assert.ok(conflictPickerButton instanceof HTMLButtonElement)

      fireEvent.click(conflictPickerButton)
      await waitFor(() => assert.ok(screen.getByText('Claude Sonnet (2x)')))
      fireEvent.click(screen.getByText('Claude Sonnet (2x)'))

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
