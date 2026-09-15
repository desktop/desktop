import * as React from 'react'
import {
  encodeModelKey,
  parseModelKey,
  type IBYOKProvider,
} from '../../lib/copilot/byok'
import { enableCopilotConflictResolution } from '../../lib/feature-flag'
import {
  DefaultCopilotModel,
  type CopilotFeature,
  type CopilotModelSelections,
  type CopilotQuotaSnapshots,
} from '../../lib/stores/copilot-store'
import type { Account } from '../../models/account'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import {
  CopilotModelPicker,
  getCopilotModelPickerSelectionInfo,
  hasCopilotModelPickerItems,
} from '../lib/copilot-model-picker'
import { LinkButton } from '../lib/link-button'
import { Row } from '../lib/row'
import { CopilotModelSelectionInfo } from './copilot-model-selection-info'
import { SnapshotCard } from './snapshot-card'
import type { Model } from '@github/copilot-sdk/dist/generated/rpc'

interface ICopilotUserSettingsProps {
  readonly account: Account
  readonly selectedCopilotModels: CopilotModelSelections
  readonly copilotModels: ReadonlyArray<Model> | null
  readonly copilotQuotaSnapshots: CopilotQuotaSnapshots | null
  readonly byokProviders: ReadonlyArray<IBYOKProvider>
  readonly showBYOKSettings: boolean
  readonly alwaysUseCopilotForConflictResolution: boolean
  readonly onSelectedCopilotModelChanged: (
    account: Account,
    feature: CopilotFeature,
    model: string | null
  ) => void
  readonly onAlwaysUseCopilotForConflictResolutionChanged: (
    checked: boolean
  ) => void
  readonly onConfigureCustomProviders: () => void
}

/** User-configurable Copilot settings with optional provider management. */
export class CopilotUserSettings extends React.Component<ICopilotUserSettingsProps> {
  private onCommitMessageModelChanged = (model: string) => {
    this.props.onSelectedCopilotModelChanged(
      this.props.account,
      'commit-message-generation',
      model
    )
  }

  private onConflictResolutionModelChanged = (model: string) => {
    this.props.onSelectedCopilotModelChanged(
      this.props.account,
      'conflict-resolution',
      model
    )
  }

  private onAlwaysUseCopilotForConflictResolutionChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onAlwaysUseCopilotForConflictResolutionChanged(
      event.currentTarget.checked
    )
  }

  public render() {
    return this.renderContent(this.renderModelPicker())
  }

  private renderContent(content: JSX.Element): JSX.Element {
    return (
      <div className="copilot-tab-content">
        <div className="copilot-settings-scroll">
          {this.renderUsage()}
          <div className="copilot-section">{content}</div>
        </div>
      </div>
    )
  }

  private renderModelPicker(): JSX.Element {
    const { copilotModels, byokProviders } = this.props

    if (copilotModels === null) {
      return <p>Loading available models…</p>
    }

    if (!hasCopilotModelPickerItems(copilotModels, byokProviders)) {
      return <p>No Copilot models available.</p>
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
          this.onCommitMessageModelChanged,
          350
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
              this.onConflictResolutionModelChanged,
              280
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

  private renderUsage(): JSX.Element {
    return (
      <div className="copilot-usage-section">
        <SnapshotCard
          account={this.props.account}
          snapshots={this.props.copilotQuotaSnapshots}
        />
      </div>
    )
  }

  private renderFeatureModelPicker(
    copilotModels: ReadonlyArray<Model>,
    feature: CopilotFeature,
    label: string,
    onChange: (model: string) => void,
    maxHeight?: number
  ): JSX.Element {
    const { byokProviders, selectedCopilotModels } = this.props

    const rawSelection = selectedCopilotModels[feature] ?? null
    const value = this.resolveSelectionValue(
      copilotModels,
      byokProviders,
      rawSelection
    )
    const selectionInfo = getCopilotModelPickerSelectionInfo(
      copilotModels,
      value
    )

    return (
      <>
        <CopilotModelPicker
          label={label}
          copilotModels={copilotModels}
          byokProviders={byokProviders}
          value={value}
          onChange={onChange}
          onConfigureCustomProviders={
            this.props.showBYOKSettings
              ? this.props.onConfigureCustomProviders
              : undefined
          }
          maxHeight={maxHeight}
        />
        {selectionInfo === null ? null : (
          <CopilotModelSelectionInfo
            feature={feature}
            selectionInfo={selectionInfo}
          />
        )}
      </>
    )
  }

  private resolveSelectionValue(
    copilotModels: ReadonlyArray<Model>,
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
    copilotModels: ReadonlyArray<Model>,
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

    const firstProvider = byokProviders.find(provider => provider.models[0])

    if (firstProvider === undefined) {
      // This should not happen because we check for selectable models earlier.
      throw new Error('No models available')
    }

    const firstByokModel = firstProvider.models[0]
    return encodeModelKey({
      kind: 'byok',
      providerId: firstProvider.id,
      modelId: firstByokModel.id,
    })
  }
}
