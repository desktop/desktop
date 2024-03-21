import * as React from 'react'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Account } from '../../models/account'
import { getHTMLURL } from '../../lib/api'
import { Ref } from '../lib/ref'
import { LinkButton } from '../lib/link-button'
import { Progress } from '../../models/progress'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { friendlyEndpointName } from '../../lib/friendly-endpoint-name'

interface ICreateTutorialRepositoryDialogProps {
  /**
   * The GitHub.com, or GitHub Enterprise account that will
   * be the owner of the tutorial repository.
   */
  readonly account: Account

  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void

  /**
   * Called when the user has indicated that the tutorial repository
   * should be created
   *
   * @param account The account (and thereby the GitHub host) under
   *                which the repository is to be created
   */
  readonly onCreateTutorialRepository: (account: Account) => void

  /**
   * The current progress in creating the tutorial repository. Undefined
   * until the creation process starts.
   */
  readonly progress?: Progress
}

/**
 * A dialog component responsible for initializing, publishing, and adding
 * a tutorial repository to the application.
 */
export class CreateTutorialRepositoryDialog extends React.Component<ICreateTutorialRepositoryDialogProps> {
  public onSubmit = () =>
    this.props.onCreateTutorialRepository(this.props.account)

  private renderProgress() {
    const { progress } = this.props

    if (progress === undefined) {
      return null
    }

    const description = progress.description ? (
      <div className="description">{progress.description}</div>
    ) : null

    return (
      <div className="progress-container">
        <div>{progress.title}</div>
        <progress value={progress.value} />
        {description}
      </div>
    )
  }

  public render() {
    const { account, progress } = this.props
    const loading = progress !== undefined

    return (
      <Dialog
        id="create-tutorial-repository-dialog"
        title="Start tutorial"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        dismissDisabled={loading}
        loading={loading}
        disabled={loading}
      >
        <DialogContent>
          <div>
            This will create a repository on your local machine, and push it to
            your account <Ref>@{this.props.account.login}</Ref> on{' '}
            <LinkButton uri={getHTMLURL(account.endpoint)}>
              {friendlyEndpointName(account)}
            </LinkButton>
            . This repository will only be visible to you, and not visible
            publicly.
          </div>
          {this.renderProgress()}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup okButtonText="Continue" />
        </DialogFooter>
      </Dialog>
    )
  }
}
