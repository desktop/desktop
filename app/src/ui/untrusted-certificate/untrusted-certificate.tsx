import * as React from 'react'
import * as URL from 'url'
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
export class UntrustedCertificate extends React.Component<
  IUntrustedCertificateProps,
  {}
> {
  public render() {
    const host = URL.parse(this.props.url).hostname
    const type = __DARWIN__ ? 'warning' : 'error'
    const buttonGroup = __DARWIN__ ? (
      <ButtonGroup destructive={true}>
        <Button type="submit">Cancel</Button>
        <Button onClick={this.onContinue}>View Certificate</Button>
      </ButtonGroup>
    ) : (
      <ButtonGroup>
        <Button type="submit">Close</Button>
        <Button onClick={this.onContinue}>Add certificate</Button>
      </ButtonGroup>
    )
    return (
      <Dialog
        title={__DARWIN__ ? 'Untrusted Server' : 'Untrusted server'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.props.onDismissed}
        type={type}
      >
        <DialogContent>
          <p>
            GitHub Desktop cannot verify the identity of {host}. The certificate
            ({this.props.certificate.subjectName}) is invalid or untrusted.{" "}
            <strong>
              This may indicate attackers are trying to steal your data.
            </strong>
          </p>
          <p>In some cases, this may be expected. For example:</p>
          <ul>
            <li>If this is a GitHub Enterprise trial.</li>
            <li>
              If your GitHub Enterprise instance is run on an unusual top-level
              domain.
            </li>
          </ul>
          <p>
            If you are unsure of what to do, cancel and contact your system
            administrator.
          </p>
        </DialogContent>
        <DialogFooter>{buttonGroup}</DialogFooter>
      </Dialog>
    )
  }

  private onContinue = () => {
    this.props.onContinue(this.props.certificate)
  }
}
