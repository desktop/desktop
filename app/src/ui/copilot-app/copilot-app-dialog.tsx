import * as React from 'react'
import { copilotAppMarketingUrl } from '../../lib/copilot-app'
import { shell } from '../../lib/app-shell'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  OkCancelButtonGroup,
} from '../dialog'

interface ICopilotAppDialogProps {
  readonly message: string
  readonly onDismissed: () => void
  readonly showPreferencesDialog: () => void
}

/** Help the user install or configure GitHub Copilot after a failed handoff. */
export class CopilotAppDialog extends React.Component<ICopilotAppDialogProps> {
  private onDownload = () => {
    shell.openExternal(copilotAppMarketingUrl)
    this.props.onDismissed()
  }

  private onShowPreferences = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    this.props.onDismissed()
    this.props.showPreferencesDialog()
  }

  public render() {
    return (
      <Dialog
        id="copilot-app"
        title="GitHub Copilot"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onDownload}
      >
        <DialogContent>
          <p>{this.props.message}</p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Download GitHub Copilot"
            cancelButtonText={__DARWIN__ ? 'Open Preferences' : 'Open options'}
            onCancelButtonClick={this.onShowPreferences}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
