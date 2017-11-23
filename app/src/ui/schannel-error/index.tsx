import * as React from 'react'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'

interface ICertificateErrorProps {
  readonly errorText: string
  readonly onDismissed: () => void
}

export class SChannelError extends React.Component<ICertificateErrorProps, {}> {
  public constructor(props: ICertificateErrorProps) {
    super(props)
  }

  public async componentDidMount() {}

  private onNavigateToHelpDocs = () => {
    // TODO: open URL in browser
  }

  public render() {
    return (
      <Dialog
        id="schannel-error"
        title="Certificate Validation Error"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onNavigateToHelpDocs}
      >
        <DialogContent>
          <p>
            GitHub Desktop encountered an error while trying to verify the TLS
            certificate associated with a server. This can often happen on
            networks where the process of validating a certificate is
            intercepted.
          </p>

          <p>The error details is:</p>

          <p className="monospace">{this.props.errorText}</p>

          <p>
            For more information about this issue and workarounds to address
            this, please refer to our external documentation.
          </p>
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">View Documentation</Button>
            <Button>Close</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
