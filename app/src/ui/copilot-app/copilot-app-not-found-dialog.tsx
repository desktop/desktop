import * as React from 'react'
import { copilotAppMarketingUrl } from '../../lib/copilot-app'
import { Dialog, DialogContent, DefaultDialogFooter } from '../dialog'
import { LinkButton } from '../lib/link-button'

interface ICopilotAppNotFoundDialogProps {
  readonly onDismissed: () => void
  readonly showPreferencesDialog: () => void
}

/** Help the user install or configure GitHub Copilot when it cannot be found. */
export class CopilotAppNotFoundDialog extends React.Component<ICopilotAppNotFoundDialogProps> {
  private onShowPreferences = () => {
    this.props.onDismissed()
    this.props.showPreferencesDialog()
  }

  public render() {
    return (
      <Dialog
        id="copilot-app"
        title="GitHub Copilot"
        onDismissed={this.props.onDismissed}
        onSubmit={this.props.onDismissed}
      >
        <DialogContent>
          <p>
            Couldn't find the GitHub Copilot App on your machine. Experience
            agent-driven development built natively on GitHub by{' '}
            <LinkButton uri={copilotAppMarketingUrl}>
              downloading GitHub Copilot
            </LinkButton>
            .
          </p>
          <p>
            Already installed it? Let us know where in{' '}
            <LinkButton onClick={this.onShowPreferences}>
              Preferences
            </LinkButton>
            .
          </p>
        </DialogContent>
        <DefaultDialogFooter />
      </Dialog>
    )
  }
}
