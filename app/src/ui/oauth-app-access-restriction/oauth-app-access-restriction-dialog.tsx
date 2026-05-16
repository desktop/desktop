import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Dispatcher } from '../dispatcher'
import { nameOf, Repository } from '../../models/repository'
import { GitErrorContext } from '../../lib/git-error-context'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { setAutomaticallyUseSystemGitForOAuthAppAccessRestrictions } from '../../lib/oauth-app-access-restrictions'

interface IOAuthAppAccessRestrictionDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly operation: 'pull' | 'push' | 'fetch'
  readonly gitArgs: ReadonlyArray<string>
  readonly gitContext?: GitErrorContext
  readonly onDismissed: () => void
}

interface IOAuthAppAccessRestrictionDialogState {
  readonly loading: boolean
  readonly skipFutureConfirmations: boolean
}

export class OAuthAppAccessRestrictionDialog extends React.Component<
  IOAuthAppAccessRestrictionDialogProps,
  IOAuthAppAccessRestrictionDialogState
> {
  public constructor(props: IOAuthAppAccessRestrictionDialogProps) {
    super(props)
    this.state = { loading: false, skipFutureConfirmations: false }
  }

  public render() {
    const { gitArgs, operation, repository } = this.props
    const command = `git ${gitArgs.join(' ')}`

    return (
      <Dialog
        title="Organization Blocks GitHub Desktop"
        loading={this.state.loading}
        disabled={this.state.loading}
        dismissDisabled={this.state.loading}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onRunSystemGit}
        type="warning"
      >
        <DialogContent>
          <p>
            The organization that owns {nameOf(repository)} blocks GitHub
            Desktop's OAuth app, so Desktop cannot access this repository using
            its signed-in app token.
          </p>
          <p>
            To fix Desktop access, an organization owner needs to approve the
            app for the organization.
          </p>
          <p>
            Your system Git may still be able to {operation} using the
            credentials available in your terminal. Run this command now?
          </p>
          <pre className="oauth-app-access-restriction-command">
            <code>{command}</code>
          </pre>
          <Checkbox
            label="Do not show this message again"
            value={
              this.state.skipFutureConfirmations
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onSkipFutureConfirmationsChanged}
          />
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup okButtonText={`Run git ${operation}`} />
        </DialogFooter>
      </Dialog>
    )
  }

  private onRunSystemGit = async () => {
    const { dispatcher, gitArgs, gitContext, operation, repository } =
      this.props

    this.setState({ loading: true })
    await dispatcher.runSystemGitCommandForOAuthAppAccessRestriction(
      repository,
      gitArgs,
      operation,
      gitContext
    )
    if (this.state.skipFutureConfirmations) {
      setAutomaticallyUseSystemGitForOAuthAppAccessRestrictions(true)
    }
    this.props.onDismissed()
  }

  private onSkipFutureConfirmationsChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.setState({ skipFutureConfirmations: event.currentTarget.checked })
  }
}
