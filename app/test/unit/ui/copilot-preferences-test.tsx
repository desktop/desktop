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
  type CopilotModelSelections,
  type CopilotQuotaSnapshots,
  type ICopilotQuotaSnapshot,
  getCopilotAccountCacheKey,
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
  readonly avatarURL?: string
  readonly name?: string
  readonly features?: ReadonlyArray<string>
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
    options.avatarURL ?? 'https://avatars.githubusercontent.com/u/1',
    options.id ?? 1,
    options.name ?? 'Mona Lisa',
    'free',
    'https://copilot-proxy.githubusercontent.com',
    isCopilotDesktopEnabled,
    options.features ?? [
      'desktop_enable_copilot_sdk_commit_message_generation',
    ],
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

function makeQuotaSnapshot(
  overrides: Partial<ICopilotQuotaSnapshot> = {}
): ICopilotQuotaSnapshot {
  return {
    isUnlimitedEntitlement: false,
    entitlementRequests: 100,
    usedRequests: 25,
    usageAllowedWithExhaustedQuota: false,
    remainingPercentage: 75,
    overage: 0,
    overageAllowedWithExhaustedQuota: false,
    tokenBasedBilling: false,
    ...overrides,
  }
}

const quotaSnapshots = new Map<string, ICopilotQuotaSnapshot>([
  ['chat', makeQuotaSnapshot()],
  [
    'premium_interactions',
    makeQuotaSnapshot({
      entitlementRequests: 300,
      usedRequests: 90,
      remainingPercentage: 70,
    }),
  ],
])

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
    selectedCopilotModelsByAccount: new Map(),
    copilotModelsByAccount: modelsForDefaultAccount(models),
    copilotQuotaSnapshotsByAccount:
      quotaSnapshotsForDefaultAccount(quotaSnapshots),
    accounts: [makeAccount()],
    byokProviders: [],
    showBYOKSettings: false,
    onSignIn: () => {},
    onOpenCopilotPlans: () => {},
    onOpenCopilotFeatureSettings: () => {},
    alwaysUseCopilotForConflictResolution: false,
    onSelectedCopilotModelChanged: () => {},
    onAlwaysUseCopilotForConflictResolutionChanged: () => {},
    onConfigureCustomProviders: () => {},
    onConfigureModels: () => {},
  }
}

function selectionsForDefaultAccount(selections: CopilotModelSelections) {
  return new Map([[getCopilotAccountCacheKey(makeAccount()), selections]])
}

function modelsForDefaultAccount(models: ReadonlyArray<Model> | null) {
  return new Map([[getCopilotAccountCacheKey(makeAccount()), models]])
}

function quotaSnapshotsForDefaultAccount(
  snapshots: CopilotQuotaSnapshots | null
) {
  return new Map([[getCopilotAccountCacheKey(makeAccount()), snapshots]])
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
    const account = makeAccount({
      endpoint: 'https://api.octocorp.ghe.com',
      id: 2,
      login: 'octo',
      name: 'Octo Cat',
      isCopilotDesktopEnabled: true,
      copilotLicenseType: 'COPILOT_BUSINESS',
    })

    render(
      <CopilotPreferences
        {...defaults()}
        copilotModelsByAccount={
          new Map([[getCopilotAccountCacheKey(account), models]])
        }
        copilotQuotaSnapshotsByAccount={
          new Map([[getCopilotAccountCacheKey(account), quotaSnapshots]])
        }
        accounts={[makeAccount({ copilotLicenseType: 'NO_ACCESS' }), account]}
      />
    )

    assert.ok(screen.getAllByRole('button', { name: /Auto/ }).length > 0)
    assert.ok(screen.getByText('@octo (Octo Cat)'))
    assert.ok(screen.getByText('https://octocorp.ghe.com/'))
    assert.strictEqual(screen.queryByText('@mona'), null)
    assert.strictEqual(screen.queryByText('View Copilot plans'), null)
  })

  it('renders Snapshot cards instead of model settings for multiple Copilot accounts', () => {
    const mona = makeAccount()
    const octo = makeAccount({
      endpoint: 'https://api.octocorp.ghe.com',
      id: 2,
      login: 'octo',
      name: 'Octo Cat',
      copilotLicenseType: 'COPILOT_BUSINESS',
    })

    const view = render(
      <CopilotPreferences
        {...defaults()}
        accounts={[mona, octo]}
        copilotQuotaSnapshotsByAccount={
          new Map([
            [getCopilotAccountCacheKey(mona), quotaSnapshots],
            [getCopilotAccountCacheKey(octo), quotaSnapshots],
          ])
        }
      />
    )

    assert.ok(screen.getByRole('heading', { name: 'GitHub.com' }))
    assert.ok(screen.getByRole('heading', { name: 'GitHub Enterprise' }))
    assert.ok(screen.getByText('Mona Lisa'))
    assert.ok(screen.getByText('@mona'))
    assert.ok(screen.getByText('@octo (Octo Cat)'))
    assert.ok(screen.getByText('https://octocorp.ghe.com/'))
    assert.strictEqual(
      view.container.querySelector('.copilot-model-picker'),
      null
    )
    assert.strictEqual(
      screen.getAllByRole('button', { name: /Configure…/i }).length,
      2
    )
  })

  it('excludes accounts without Copilot SDK access from settings', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        accounts={[
          makeAccount(),
          makeAccount({
            endpoint: 'https://api.octocorp.ghe.com',
            id: 2,
            login: 'octo',
            name: 'Octo Cat',
            features: [],
            copilotLicenseType: 'COPILOT_BUSINESS',
          }),
        ]}
      />
    )

    assert.ok(screen.getAllByRole('button', { name: /Auto/ }).length > 0)
    assert.ok(screen.getByText('Mona Lisa'))
    assert.strictEqual(screen.queryByText('@octo (Octo Cat)'), null)
    assert.strictEqual(
      screen.queryByRole('heading', { name: 'GitHub Enterprise' }),
      null
    )
  })

  it('makes multiple account Snapshot cards scrollable', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        accounts={[
          makeAccount(),
          makeAccount({
            endpoint: 'https://api.octocorp.ghe.com',
            id: 2,
            login: 'octo',
            name: 'Octo Cat',
            copilotLicenseType: 'COPILOT_BUSINESS',
          }),
        ]}
      />
    )

    const settingsScroll = view.container.querySelector(
      '.copilot-settings-scroll'
    )
    const snapshotGroups = view.container.querySelector(
      '.copilot-account-snapshot-groups'
    )
    assert.ok(settingsScroll instanceof HTMLElement)
    assert.ok(snapshotGroups instanceof HTMLElement)
    assert.strictEqual(settingsScroll.contains(snapshotGroups), true)
  })

  it('requests account-specific Copilot settings from a Snapshot card', () => {
    const mona = makeAccount()
    const octo = makeAccount({
      endpoint: 'https://api.octocorp.ghe.com',
      id: 2,
      login: 'octo',
      name: 'Octo Cat',
      copilotLicenseType: 'COPILOT_BUSINESS',
    })
    const configuredAccounts = new Array<Account>()

    const view = render(
      <CopilotPreferences
        {...defaults()}
        accounts={[mona, octo]}
        copilotModelsByAccount={
          new Map([
            [getCopilotAccountCacheKey(mona), [defaultModel]],
            [getCopilotAccountCacheKey(octo), models],
          ])
        }
        copilotQuotaSnapshotsByAccount={
          new Map([
            [getCopilotAccountCacheKey(mona), quotaSnapshots],
            [getCopilotAccountCacheKey(octo), quotaSnapshots],
          ])
        }
        onConfigureModels={account => configuredAccounts.push(account)}
      />
    )

    const cards = view.container.querySelectorAll('.copilot-snapshot-card')
    assert.strictEqual(cards.length, 2)
    const octoCard = cards[1]
    assert.ok(octoCard instanceof HTMLElement)
    fireEvent.click(
      within(octoCard).getByRole('button', { name: /Configure…/i })
    )

    assert.deepStrictEqual(configuredAccounts, [octo])
    assert.strictEqual(screen.queryByText('Copilot Settings: @octo'), null)
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
    render(
      <CopilotPreferences
        {...defaults()}
        copilotModelsByAccount={modelsForDefaultAccount(null)}
      />
    )
    assert.ok(screen.getByText('Loading available models…'))
  })

  it('shows no-models message when fetch completed with empty result', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        copilotModelsByAccount={modelsForDefaultAccount([])}
      />
    )
    assert.ok(screen.getByText('No Copilot models available.'))
  })

  it('shows a loading message when quota snapshots have not been fetched', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        copilotQuotaSnapshotsByAccount={quotaSnapshotsForDefaultAccount(null)}
      />
    )

    assert.ok(screen.getByText('Loading Copilot usage…'))
  })

  it('renders Copilot quota snapshot cards', () => {
    const view = render(<CopilotPreferences {...defaults()} />)

    assert.strictEqual(screen.queryByRole('heading', { name: 'Usage' }), null)
    assert.ok(screen.getByAltText('Avatar for Mona Lisa'))
    assert.ok(screen.getByText('Mona Lisa'))
    assert.ok(screen.getByText('@mona'))
    assert.ok(screen.getByText('Chat messages'))
    assert.ok(screen.getByText('Premium requests'))

    const modelPicker = view.container.querySelector('.copilot-model-picker')
    const settingsScroll = view.container.querySelector(
      '.copilot-settings-scroll'
    )
    const usageSection = view.container.querySelector('.copilot-usage-section')
    assert.ok(modelPicker instanceof HTMLElement)
    assert.ok(settingsScroll instanceof HTMLElement)
    assert.ok(usageSection instanceof HTMLElement)
    assert.strictEqual(settingsScroll.contains(modelPicker), true)
    assert.strictEqual(settingsScroll.contains(usageSection), true)
    assert.strictEqual(
      usageSection.compareDocumentPosition(modelPicker) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      Node.DOCUMENT_POSITION_FOLLOWING
    )

    const progressBars = screen.getAllByRole('progressbar')
    assert.strictEqual(progressBars.length, 2)
    assert.strictEqual(progressBars[0].getAttribute('aria-valuenow'), '25')
    assert.strictEqual(
      progressBars[0].getAttribute('aria-label'),
      '25% quota used'
    )
    assert.strictEqual(progressBars[1].getAttribute('aria-valuenow'), '30')
    assert.ok(screen.getByText('25%'))
    assert.ok(screen.getByText('30%'))
  })

  it('renders code completions quota snapshots', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        copilotQuotaSnapshotsByAccount={quotaSnapshotsForDefaultAccount(
          new Map<string, ICopilotQuotaSnapshot>([
            [
              'completions',
              makeQuotaSnapshot({
                entitlementRequests: 100,
                usedRequests: 25,
                remainingPercentage: 75,
              }),
            ],
          ])
        )}
      />
    )

    assert.ok(screen.getByText('Code completions'))
    assert.ok(screen.getByText('25%'))
  })

  it('describes unlimited quotas as determinate progress', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        copilotQuotaSnapshotsByAccount={quotaSnapshotsForDefaultAccount(
          new Map<string, ICopilotQuotaSnapshot>([
            [
              'chat',
              makeQuotaSnapshot({
                isUnlimitedEntitlement: true,
                entitlementRequests: -1,
                usedRequests: 0,
                remainingPercentage: 100,
              }),
            ],
          ])
        )}
      />
    )

    const progressBar = screen.getByRole('progressbar', {
      name: 'No usage limit',
    })
    assert.strictEqual(progressBar.getAttribute('aria-valuenow'), '0')
    assert.strictEqual(progressBar.getAttribute('aria-valuemin'), '0')
    assert.strictEqual(progressBar.getAttribute('aria-valuemax'), '100')
    assert.strictEqual(
      progressBar.getAttribute('aria-valuetext'),
      'No usage limit'
    )
  })

  it('renders token-based billing quota snapshots as AI credits', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        copilotQuotaSnapshotsByAccount={quotaSnapshotsForDefaultAccount(
          new Map<string, ICopilotQuotaSnapshot>([
            [
              'chat',
              makeQuotaSnapshot({
                isUnlimitedEntitlement: true,
                entitlementRequests: -1,
                usedRequests: 0,
                remainingPercentage: 100,
                tokenBasedBilling: true,
              }),
            ],
            [
              'completions',
              makeQuotaSnapshot({
                isUnlimitedEntitlement: true,
                entitlementRequests: -1,
                usedRequests: 0,
                remainingPercentage: 100,
                tokenBasedBilling: true,
              }),
            ],
            [
              'premium_interactions',
              makeQuotaSnapshot({
                entitlementRequests: 12.5,
                usedRequests: 2.5,
                remainingPercentage: 80,
                tokenBasedBilling: true,
              }),
            ],
          ])
        )}
      />
    )

    assert.ok(screen.getByText('AI credits'))
    assert.ok(screen.getByText('(resets monthly)'))
    assert.strictEqual(screen.queryByText('Chat messages'), null)
    assert.ok(screen.getByText('20%'))
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
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': encodeModelKey({
            kind: 'copilot',
            modelId: 'usage-billed-model',
          }),
        })}
      />
    )

    const button = getModelPickerButton(view.container)

    assert.ok(within(button).getByText('Usage Billed Model'))
    assert.strictEqual(within(button).queryByText(/Use of credits/), null)
    assert.ok(
      screen.getAllByText('Lightweight model. Use of credits: low').length > 0
    )
    assert.strictEqual(screen.queryByText(/AI credits per/), null)
    assert.ok(!button.textContent?.includes('low cost'))

    const costsButton = screen.getByRole('button', {
      name: 'Show Copilot model credit costs',
    })

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
        copilotModelsByAccount={modelsForDefaultAccount([partiallyPricedModel])}
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': encodeModelKey({
            kind: 'copilot',
            modelId: 'partially-priced-model',
          }),
        })}
      />
    )

    assert.ok(
      screen.getAllByText('Lightweight model. Use of credits: low').length > 0
    )

    const costsButton = screen.getAllByRole('button', {
      name: 'Show Copilot model credit costs',
    })[0]
    assert.ok(costsButton instanceof HTMLButtonElement)
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
        copilotModelsByAccount={modelsForDefaultAccount([
          missingBatchSizeModel,
        ])}
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': encodeModelKey({
            kind: 'copilot',
            modelId: 'missing-batch-size-model',
          }),
        })}
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
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': 'claude-sonnet',
        })}
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
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': encodeModelKey({
            kind: 'byok',
            providerId: ollamaProvider.id,
            modelId: 'llama3',
          }),
        })}
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
        onSelectedCopilotModelChanged={(_, f, m) =>
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
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': 'claude-sonnet',
        })}
        onSelectedCopilotModelChanged={(_, f, m) =>
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
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': 'deleted-model',
        })}
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
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': encodeModelKey({
            kind: 'byok',
            providerId: 'missing-provider',
            modelId: 'llama3',
          }),
        })}
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
        copilotModelsByAccount={modelsForDefaultAccount(onlyOtherModel)}
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': 'deleted-model',
        })}
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
        copilotModelsByAccount={modelsForDefaultAccount([])}
        byokProviders={[ollamaProvider]}
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': 'deleted-model',
        })}
      />
    )

    const buttonText = getModelPickerButtonText(view.container)
    assert.ok(buttonText.includes('Llama 3'))
    assert.ok(!buttonText.includes('Ollama'))
  })

  it('always shows models without settings tabs', () => {
    const view = render(<CopilotPreferences {...defaults()} />)
    const tabs = view.container.querySelectorAll('[role="tab"]')
    assert.strictEqual(tabs.length, 0)
    assert.ok(getModelPickerButtons(view.container).length > 0)
  })

  it('hides custom provider configuration when BYOK settings are disabled', () => {
    const view = render(
      <CopilotPreferences {...defaults()} showBYOKSettings={false} />
    )
    fireEvent.click(getModelPickerButton(view.container))
    assert.strictEqual(
      screen.queryByRole('button', { name: 'Configure custom providers…' }),
      null
    )
  })

  it('opens custom provider configuration from the model picker', () => {
    let called = 0
    const view = render(
      <CopilotPreferences
        {...defaults()}
        showBYOKSettings={true}
        onConfigureCustomProviders={() => {
          called += 1
        }}
      />
    )

    fireEvent.click(getModelPickerButton(view.container))
    fireEvent.click(
      screen.getByRole('button', { name: 'Configure custom providers…' })
    )

    assert.strictEqual(called, 1)
  })

  describe('conflict resolution model picker', () => {
    it('renders a second picker', () => {
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
          onSelectedCopilotModelChanged={(_, f, m) =>
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
