import * as React from 'react'
import { DialogContent } from '../dialog'
import { Row } from '../lib/row'
import { Select } from '../lib/select'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { TabBar } from '../tab-bar'
import type { ModelInfo } from '@github/copilot-sdk'
import {
  DefaultCopilotModel,
  type CopilotFeature,
  type CopilotModelSelections,
} from '../../lib/stores/copilot-store'
import {
  IBYOKProvider,
  encodeModelKey,
  isLocalBaseUrl,
  parseModelKey,
} from '../../lib/copilot/byok'
import { enableCopilotConflictResolution } from '../../lib/feature-flag'

interface ICopilotPreferencesProps {
  readonly selectedCopilotModels: CopilotModelSelections
  readonly copilotModels: ReadonlyArray<ModelInfo> | null
  readonly copilotAvailable: boolean
  readonly byokProviders: ReadonlyArray<IBYOKProvider>
  readonly showBYOKSettings: boolean
  readonly alwaysUseCopilotForConflictResolution: boolean
  readonly onSelectedCopilotModelChanged: (
    feature: CopilotFeature,
    model: string | null
  ) => void
  readonly onAlwaysUseCopilotForConflictResolutionChanged: (
    checked: boolean
  ) => void
  readonly onAddBYOKProvider: () => void
  readonly onEditBYOKProvider: (provider: IBYOKProvider) => void
  readonly onDeleteBYOKProvider: (provider: IBYOKProvider) => void
}

interface ICopilotPreferencesState {
  readonly selectedTabIndex: number
}

export class CopilotPreferences extends React.Component<
  ICopilotPreferencesProps,
  ICopilotPreferencesState
> {
  public constructor(props: ICopilotPreferencesProps) {
    super(props)
    this.state = { selectedTabIndex: 0 }
  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedTabIndex: index })
  }

  private onCommitMessageModelChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    this.props.onSelectedCopilotModelChanged(
      'commit-message-generation',
      event.currentTarget.value
    )
  }

  private onConflictResolutionModelChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    this.props.onSelectedCopilotModelChanged(
      'conflict-resolution',
      event.currentTarget.value
    )
  }

  private onAlwaysUseCopilotForConflictResolutionChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onAlwaysUseCopilotForConflictResolutionChanged(
      event.currentTarget.checked
    )
  }

  private onAddBYOKProviderClick = () => this.props.onAddBYOKProvider()

  private onEditBYOKProviderClick = (provider: IBYOKProvider) => () =>
    this.props.onEditBYOKProvider(provider)

  private onDeleteBYOKProviderClick = (provider: IBYOKProvider) => () =>
    this.props.onDeleteBYOKProvider(provider)

  public render() {
    const showBYOK = this.props.showBYOKSettings && this.props.copilotAvailable

    if (!showBYOK) {
      return (
        <DialogContent className="copilot-tab">
          <div className="copilot-tab-content">
            <div className="copilot-section">{this.renderModelPicker()}</div>
          </div>
        </DialogContent>
      )
    }

    return (
      <DialogContent className="copilot-tab">
        <TabBar
          selectedIndex={this.state.selectedTabIndex}
          onTabClicked={this.onTabClicked}
        >
          <span>Models</span>
          <span>Providers</span>
        </TabBar>
        <div className="copilot-tab-content">
          <div className="copilot-section">{this.renderCurrentTab()}</div>
        </div>
      </DialogContent>
    )
  }

  private renderCurrentTab() {
    if (this.state.selectedTabIndex === 1) {
      return this.renderBYOKProviders()
    }
    return this.renderModelPicker()
  }

  private renderModelPicker() {
    if (!this.props.copilotAvailable) {
      return (
        <p>
          Sign in to a GitHub.com account in the Accounts tab to configure
          Copilot settings.
        </p>
      )
    }

    const { copilotModels, byokProviders } = this.props

    if (copilotModels === null) {
      return <p>Loading available models…</p>
    }

    if (copilotModels.length === 0 && byokProviders.length === 0) {
      return <p>No models available. Check your Copilot subscription.</p>
    }

    return (
      <>
        <Row className="copilot-feature-hint">
          <p>
            Tailor how Copilot behaves by using{' '}
            <LinkButton uri="https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions">
              custom instructions
            </LinkButton>
            .
          </p>
        </Row>
        {this.renderFeatureModelPicker(
          copilotModels,
          'commit-message-generation',
          __DARWIN__
            ? 'Commit Message Generation'
            : 'Commit message generation',
          this.onCommitMessageModelChanged
        )}
        <p className="settings-description">
          <LinkButton uri="https://docs.github.com/en/desktop/making-changes-in-a-branch/committing-and-reviewing-changes-to-your-project-in-github-desktop#write-a-commit-message-and-push-your-changes">
            Learn more about generating commit messages.
          </LinkButton>
        </p>
        {enableCopilotConflictResolution() && (
          <>
            {this.renderFeatureModelPicker(
              copilotModels,
              'conflict-resolution',
              __DARWIN__ ? 'Conflict Resolution' : 'Conflict resolution',
              this.onConflictResolutionModelChanged
            )}
            <p className="settings-description">
              Model changes apply to future conflict resolutions.
            </p>
            <Checkbox
              label={
                __DARWIN__
                  ? 'Always Use Copilot When Conflicts Are Detected'
                  : 'Always use Copilot when conflicts are detected'
              }
              value={
                this.props.alwaysUseCopilotForConflictResolution
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onAlwaysUseCopilotForConflictResolutionChanged}
            />
          </>
        )}
      </>
    )
  }

  private renderFeatureModelPicker(
    copilotModels: ReadonlyArray<ModelInfo>,
    feature: CopilotFeature,
    label: string,
    onChange: (event: React.FormEvent<HTMLSelectElement>) => void
  ): JSX.Element {
    const { byokProviders, selectedCopilotModels } = this.props

    const rawSelection = selectedCopilotModels[feature] ?? null
    const value = this.resolveSelectionValue(
      copilotModels,
      byokProviders,
      rawSelection
    )

    return (
      <Select label={label} value={value} onChange={onChange}>
        {copilotModels.length > 0 && (
          <optgroup label="GitHub Copilot">
            {copilotModels.map(m => (
              <option
                key={m.id}
                value={encodeModelKey({ kind: 'copilot', modelId: m.id })}
              >
                {m.id === DefaultCopilotModel ? `${m.name} (default)` : m.name}
              </option>
            ))}
          </optgroup>
        )}
        {byokProviders.map(p => (
          <optgroup key={p.id} label={p.name}>
            {p.models.map(m => (
              <option
                key={m.id}
                value={encodeModelKey({
                  kind: 'byok',
                  providerId: p.id,
                  modelId: m.id,
                })}
              >
                {m.name}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    )
  }

  private resolveSelectionValue(
    copilotModels: ReadonlyArray<ModelInfo>,
    byokProviders: ReadonlyArray<IBYOKProvider>,
    raw: string | null
  ): string {
    if (raw !== null) {
      const key = parseModelKey(raw)
      if (key.kind === 'byok') {
        const provider = byokProviders.find(p => p.id === key.providerId)
        if (provider && provider.models.some(m => m.id === key.modelId)) {
          return encodeModelKey(key)
        }
      } else if (
        key.modelId !== '' &&
        copilotModels.some(m => m.id === key.modelId)
      ) {
        return encodeModelKey({ kind: 'copilot', modelId: key.modelId })
      }
    }

    return this.getFirstSelectableModelValue(copilotModels, byokProviders)
  }

  private getFirstSelectableModelValue(
    copilotModels: ReadonlyArray<ModelInfo>,
    byokProviders: ReadonlyArray<IBYOKProvider>
  ): string {
    if (copilotModels.length === 0 && byokProviders.length === 0) {
      // This should not happen because we check for this case earlier, but let's
      // make that assumption explicit and crash if it is violated rather than
      // returning null.
      throw new Error('No models available')
    }

    const preferredCopilotModel = copilotModels.find(
      m => m.id === DefaultCopilotModel
    )
    if (preferredCopilotModel !== undefined) {
      return encodeModelKey({
        kind: 'copilot',
        modelId: preferredCopilotModel.id,
      })
    }

    const firstCopilotModel = copilotModels[0]
    if (firstCopilotModel !== undefined) {
      return encodeModelKey({ kind: 'copilot', modelId: firstCopilotModel.id })
    }

    const firstProvider = byokProviders[0]
    const firstByokModel = firstProvider.models[0]
    return encodeModelKey({
      kind: 'byok',
      providerId: firstProvider.id,
      modelId: firstByokModel.id,
    })
  }

  private renderBYOKProviders() {
    const { byokProviders } = this.props
    return (
      <>
        {byokProviders.length === 0 ? (
          <p className="copilot-byok-empty">
            Add a custom provider to use your own API keys with
            OpenAI-compatible endpoints, Azure, Anthropic, or local providers
            like Ollama.
          </p>
        ) : (
          <ul className="copilot-byok-entry-list">
            {byokProviders.map(this.renderBYOKProvider)}
          </ul>
        )}
        <Button onClick={this.onAddBYOKProviderClick}>
          {__DARWIN__ ? 'Add Provider…' : 'Add provider…'}
        </Button>
      </>
    )
  }

  private renderBYOKProvider = (provider: IBYOKProvider) => {
    const modelCount = provider.models.length
    const modelLabel = modelCount === 1 ? '1 model' : `${modelCount} models`
    const isLocal = isLocalBaseUrl(provider.baseUrl)
    return (
      <li key={provider.id} className="copilot-byok-entry">
        <div className="copilot-byok-entry-info">
          <div className="copilot-byok-entry-title">
            <span>{provider.name}</span>
            {isLocal && (
              <span className="copilot-byok-provider-badge">Local</span>
            )}
          </div>
          <span className="copilot-byok-entry-meta">
            {this.formatProviderType(provider)} · {modelLabel}
          </span>
        </div>
        <div className="copilot-byok-entry-actions">
          <Button
            onClick={this.onEditBYOKProviderClick(provider)}
            ariaLabel={`Edit ${provider.name}`}
          >
            <Octicon symbol={octicons.pencil} />
          </Button>
          <Button
            onClick={this.onDeleteBYOKProviderClick(provider)}
            ariaLabel={`Remove ${provider.name}`}
          >
            <Octicon symbol={octicons.trash} />
          </Button>
        </div>
      </li>
    )
  }

  private formatProviderType(provider: IBYOKProvider): string {
    switch (provider.type) {
      case 'openai':
        return 'OpenAI-compatible'
      case 'azure':
        return 'Azure'
      case 'anthropic':
        return 'Anthropic'
    }
  }
}
