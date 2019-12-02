import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { IRemote } from '../../models/remote'
import { Ref } from '../lib/ref'
import { forceUnwrap } from '../../lib/fatal-error'
import { UpstreamRemoteName } from '../../lib/stores'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IUpstreamAlreadyExistsProps {
  readonly repository: Repository
  readonly existingRemote: IRemote

  readonly onDismissed: () => void

  /** Called when the user chooses to update the existing remote. */
  readonly onUpdate: (repository: Repository) => void

  /** Called when the user chooses to ignore the warning. */
  readonly onIgnore: (repository: Repository) => void
}

/**
 * The dialog shown when a repository is a fork but its upstream remote doesn't
 * point to the parent repository.
 */
export class UpstreamAlreadyExists extends React.Component<
  IUpstreamAlreadyExistsProps
> {
  public render() {
    const name = this.props.repository.name
    const gitHubRepository = forceUnwrap(
      'A repository must have a GitHub repository to add an upstream remote',
      this.props.repository.gitHubRepository
    )
    const parent = forceUnwrap(
      'A repository must have a parent repository to add an upstream remote',
      gitHubRepository.parent
    )
    const parentName = parent.fullName
    const existingURL = this.props.existingRemote.url
    const replacementURL = parent.cloneURL
    return (
      <Dialog
        title={
          __DARWIN__ ? 'Upstream Already Exists' : 'Upstream already exists'
        }
        onDismissed={this.props.onDismissed}
        onSubmit={this.onUpdate}
        type="warning"
      >
        <DialogContent>
          <p>
            The repository <Ref>{name}</Ref> is a fork of{' '}
            <Ref>{parentName}</Ref>, but its <Ref>{UpstreamRemoteName}</Ref>{' '}
            remote points elsewhere.
          </p>
          <ul>
            <li>
              Current: <Ref>{existingURL}</Ref>
            </li>
            <li>
              Expected: <Ref>{replacementURL}</Ref>
            </li>
          </ul>
          <p>Would you like to update the remote to use the expected URL?</p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText="Update"
            cancelButtonText="Ignore"
            onCancelButtonClick={this.onIgnore}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onUpdate = () => {
    this.props.onUpdate(this.props.repository)
    this.props.onDismissed()
  }

  private onIgnore = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    this.props.onIgnore(this.props.repository)
    this.props.onDismissed()
  }
}
