import * as React from 'react'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'

interface IUntrustedCertificateProps {
  /** The untrusted certificate. */
  readonly certificate: Electron.Certificate

  /** The URL which was being accessed. */
  readonly url: string

  /** The function to call when the user chooses to dismiss the dialog. */
  readonly onDismissed: () => void

  /**
   * The function to call when the user chooses to continue in the process of
   * trusting the certificate.
   */
  readonly onContinue: (certificate: Electron.Certificate) => void
}

/**
 * The dialog we display when an API request encounters an untrusted
 * certificate.
 */
export class UntrustedCertificate extends React.Component<IUntrustedCertificateProps, void> {
  public render() {
    console.log(this.props.certificate)

    return (
      <Dialog
        title={__DARWIN__ ? 'Untrusted Server' : 'Untrusted server'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onContinue}
      >
        <DialogContent>
          <p>Yo this certificate is hella dodgey.</p>
          <p>{this.props.url}</p>
          <p>{this.props.certificate.issuerName}</p>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type='submit'>Continue</Button>
            <Button>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onContinue = () => {
    this.props.onContinue(this.props.certificate)
  }
}
