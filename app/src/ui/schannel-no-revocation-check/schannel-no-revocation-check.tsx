import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { setGlobalConfigValue } from '../../lib/git'

interface ISChannelNoRevocationCheckDialogProps {
  /**
   * The url that Git failed to access due to schannel being unable
   * to perform a certificate revocation check, parsed from the
   * error message.
   */
  readonly url: string

  readonly onDismissed: () => void
}
interface ISChannelNoRevocationCheckDialogState {
  readonly loading: boolean
}

/**
 * The dialog shown when a Git network operation fails due to the
 * schannel https backend being unable to perform a certificate
 * revocation check.
 *
 * This can only occur on Windows.
 */
export class SChannelNoRevocationCheckDialog extends React.Component<
  ISChannelNoRevocationCheckDialogProps,
  ISChannelNoRevocationCheckDialogState
> {
  public constructor(props: ISChannelNoRevocationCheckDialogProps) {
    super(props)
    this.state = { loading: false }
  }

  private onDisableRevocationChecks = async () => {
    this.setState({ loading: true })
    await setGlobalConfigValue('http.schannelCheckRevoke', 'false')
    this.props.onDismissed()
  }

  public render() {
    return (
      <Dialog
        title="Certificate revocation check failed"
        loading={this.state.loading}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onDisableRevocationChecks}
        type="error"
      >
        <DialogContent>
          <p>
            Error when attempting to access '{this.props.url}', unable to
            perform certificate revocation check. See the Event Viewer for more
            details.
          </p>
          <p>
            This error is common when accessing the Internet through a corporate
            proxy server or a debugging proxy that performs SSL inspection.
          </p>
          <p>
            Would you like to disable certificate revocation checks? You can
            change this at any time in options.
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup okButtonText="Disable revocation checks" />
        </DialogFooter>
      </Dialog>
    )
  }
}
