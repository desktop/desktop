import * as React from 'react'
import type { Model } from '@github/copilot-sdk/dist/generated/rpc'
import type { IBYOKProvider } from '../../lib/copilot/byok'
import type {
  CopilotFeature,
  CopilotModelSelections,
  CopilotQuotaSnapshots,
} from '../../lib/stores/copilot-store'
import type { Account } from '../../models/account'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { CopilotUserSettings } from './copilot-user-settings'

interface ICopilotSettingsDialogProps {
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
  readonly onDismissed: () => void
}

export class CopilotSettingsDialog extends React.Component<ICopilotSettingsDialogProps> {
  public render() {
    return (
      <Dialog
        id="copilot-settings-dialog"
        className="copilot-settings-dialog"
        title={__DARWIN__ ? 'Copilot Settings' : 'Copilot settings'}
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent className="copilot-tab">
          <CopilotUserSettings
            account={this.props.account}
            selectedCopilotModels={this.props.selectedCopilotModels}
            copilotModels={this.props.copilotModels}
            copilotQuotaSnapshots={this.props.copilotQuotaSnapshots}
            byokProviders={this.props.byokProviders}
            showBYOKSettings={this.props.showBYOKSettings}
            alwaysUseCopilotForConflictResolution={
              this.props.alwaysUseCopilotForConflictResolution
            }
            onSelectedCopilotModelChanged={
              this.props.onSelectedCopilotModelChanged
            }
            onAlwaysUseCopilotForConflictResolutionChanged={
              this.props.onAlwaysUseCopilotForConflictResolutionChanged
            }
            onConfigureCustomProviders={this.props.onConfigureCustomProviders}
          />
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Done"
            cancelButtonVisible={false}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
