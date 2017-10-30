import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { Repository } from '../../models/repository'
import { IRemote } from '../../models/remote'
import { Ref } from '../lib/ref'
import { forceUnwrap } from '../../lib/fatal-error'
import { UpstreamRemoteName } from '../../lib/stores'

interface IUpstreamAlreadyExistsProps {
  readonly repository: Repository
  readonly existingRemote: IRemote

  readonly onDismissed: () => void
  readonly onUpdate: (repository: Repository) => void
  readonly onIgnore: (repository: Repository) => void
}

export class UpstreamAlreadyExists extends React.Component<
  IUpstreamAlreadyExistsProps
> {
  public render() {
    const name = this.props.repository.name
    const parent = forceUnwrap(
      '',
      forceUnwrap('', this.props.repository.gitHubRepository).parent
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
        onSubmit={this.onIgnore}
        type="warning"
      >
        <DialogContent>
          <p>
            <Ref>{name}</Ref> is a fork of <Ref>{parentName}</Ref>, but its{' '}
            <Ref>{UpstreamRemoteName}</Ref> remote is <Ref>{existingURL}</Ref>{' '}
            instead of <Ref>{replacementURL}</Ref>
          </p>
          <p>
            Would you like to update the <Ref>{UpstreamRemoteName}</Ref> remote
            to use the expected URL?
          </p>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup destructive={true}>
            <Button type="submit">Ignore</Button>
            <Button onClick={this.onUpdate}>Update</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onUpdate = () => {
    this.props.onUpdate(this.props.repository)
    this.props.onDismissed()
  }

  private onIgnore = () => {
    this.props.onIgnore(this.props.repository)
    this.props.onDismissed()
  }
}
