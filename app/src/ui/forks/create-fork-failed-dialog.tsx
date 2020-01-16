import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'

interface ICreateForkFailedDialogProps {
  readonly repository: Repository
  readonly onDismissed: () => void
}

/**
 * Alerts the user that fork creation failed
 */
export class CreateForkFailedDialog extends React.Component<
  ICreateForkFailedDialogProps
> {
  public render() {
    const suggestion =
      this.props.repository.gitHubRepository !== null &&
      this.props.repository.gitHubRepository.htmlURL !== null ? (
        <>
          You can try creating the fork manually at{' '}
          <LinkButton>
            {this.props.repository.gitHubRepository.htmlURL}
          </LinkButton>
        </>
      ) : (
        undefined
      )
    return (
      <Dialog
        onDismissed={this.props.onDismissed}
        type="error"
        title={__DARWIN__ ? 'Fork Creation Failed' : 'Fork creation failed'}
      >
        <DialogContent>
          Creating a fork for {this.props.repository.name} failed.
          {suggestion}
        </DialogContent>
        <DialogFooter>
          <Button tooltip="Ok" type="submit">
            Ok
          </Button>
        </DialogFooter>
      </Dialog>
    )
  }
}
