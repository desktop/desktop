import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DefaultDialogFooter,
} from '../dialog'
import { Dispatcher } from '../dispatcher'
import { RepositoryWithGitHubRepository } from '../../models/repository'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { DialogHeader } from '../dialog/header'
import { sendNonFatalException } from '../../lib/helpers/non-fatal-exception'
import { Account } from '../../models/account'
import { API } from '../../lib/api'
import { LinkButton } from '../lib/link-button'

interface ICreateForkDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: RepositoryWithGitHubRepository
  readonly account: Account
  readonly onDismissed: () => void
}

interface ICreateForkDialogState {
  readonly loading: boolean
  readonly error?: Error
}

/**
 * Dialog offering to make a fork of the given repository
 */
export class CreateForkDialog extends React.Component<
  ICreateForkDialogProps,
  ICreateForkDialogState
> {
  public constructor(props: ICreateForkDialogProps) {
    super(props)
    this.state = { loading: false }
  }
  /**
   *  Starts fork process on GitHub!
   */
  private onSubmit = async () => {
    this.setState({ loading: true })
    const { gitHubRepository } = this.props.repository
    const api = API.fromAccount(this.props.account)
    try {
      const fork = await api.forkRepository(
        gitHubRepository.owner.login,
        gitHubRepository.name
      )
      await this.props.dispatcher.convertRepositoryToFork(
        this.props.repository,
        fork
      )
      this.setState({ loading: false })
      this.props.onDismissed()
    } catch (e) {
      log.error(`Fork creation through API failed (${e})`)
      sendNonFatalException('forkCreation', e)
      this.setState({ error: e, loading: false })
    }
  }

  public render() {
    if (this.state.error === undefined) {
      return (
        <Dialog
          onDismissed={this.props.onDismissed}
          onSubmit={this.onSubmit}
          type="normal"
          key={this.props.repository.name}
          id="create-fork"
        >
          <DialogHeader
            title="Do you want to fork this repository?"
            dismissable={!this.state.loading}
            onDismissed={this.props.onDismissed}
            loading={this.state.loading}
          />
          <DialogContent>
            Looks like you don’t have write access to this repository. Do you
            want to fork this repository to continue?
          </DialogContent>
          <DialogFooter>
            <OkCancelButtonGroup
              destructive={true}
              okButtonText={
                __DARWIN__ ? 'Fork This Repository' : 'Fork this repository'
              }
              okButtonDisabled={this.state.loading}
              cancelButtonDisabled={this.state.loading}
            />
          </DialogFooter>
        </Dialog>
      )
    }
    return renderError(
      this.props.repository,
      this.state.error,
      this.props.onDismissed
    )
  }
}

function renderError(
  repository: RepositoryWithGitHubRepository,
  error: Error,
  onDismissed: () => void
) {
  const suggestion =
    repository.gitHubRepository.htmlURL !== null ? (
      <>
        You can try creating the fork manually at{' '}
        <LinkButton>{repository.gitHubRepository.htmlURL}</LinkButton>.
      </>
    ) : (
      undefined
    )
  return (
    <Dialog
      onDismissed={onDismissed}
      type="error"
      title={__DARWIN__ ? 'Fork Creation Failed' : 'Fork creation failed'}
      key={repository.name}
      id="create-fork"
    >
      <DialogContent>
        <div>
          Creating your fork of <strong>{repository.name}</strong> failed.
          {` `}
          {suggestion}
        </div>
        <details>
          <summary>Error details</summary>
          <pre className="error">{error.message}</pre>
        </details>
      </DialogContent>
      <DefaultDialogFooter />
    </Dialog>
  )
}
