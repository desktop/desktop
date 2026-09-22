import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../dispatcher'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Account, isEnterpriseAccount } from '../../models/account'
import { getHTMLURL } from '../../lib/api'
import { Ref } from '../lib/ref'

interface IInvalidatedTokenProps {
  readonly dispatcher: Pick<
    Dispatcher,
    'showEnterpriseSignInDialog' | 'showDotComSignInDialog'
  >
  readonly account: Account
  readonly onDismissed: () => void
}

/**
 * Dialog that alerts user that their GitHub (Enterprise) account token is not
 * valid and they need to sign in again.
 */
export class InvalidatedToken extends React.Component<IInvalidatedTokenProps> {
  public render() {
    const { account } = this.props

    return (
      <Dialog
        id="invalidated-token"
        type="warning"
        title={__DARWIN__ ? 'Sign In Again' : 'Sign in again'}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          Your session for <Ref>{account.friendlyEndpoint}</Ref> could not be
          renewed. Sign in again to continue. Your local repositories and
          changes are not affected.
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Sign in"
            cancelButtonText="Not now"
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = () => {
    const { dispatcher, onDismissed, account } = this.props

    onDismissed()

    if (isEnterpriseAccount(account)) {
      dispatcher.showEnterpriseSignInDialog(
        getHTMLURL(this.props.account.endpoint)
      )
    } else {
      dispatcher.showDotComSignInDialog()
    }
  }
}
