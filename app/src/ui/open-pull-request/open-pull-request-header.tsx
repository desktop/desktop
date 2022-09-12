import * as React from 'react'
import { DialogHeader } from '../dialog/header'
import { createUniqueId } from '../lib/id-pool'
import { Ref } from '../lib/ref'

interface IOpenPullRequestDialogHeaderProps {
  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the dismissable prop.
   */
  readonly onDismissed?: () => void
}

/**
 * A header component for the open pull request dialog. Made to house the
 * base branch dropdown and merge details common to all pull request views.
 */
export class OpenPullRequestDialogHeader extends React.Component<
  IOpenPullRequestDialogHeaderProps,
  {}
> {
  public render() {
    const title = __DARWIN__ ? 'Open a Pull Request' : 'Open a pull request'
    return (
      <DialogHeader
        title={title}
        titleId={createUniqueId(`Dialog_${title}_${title}`)}
        dismissable={true}
        onDismissed={this.props.onDismissed}
      >
        <div className="break"></div>
        <div className="base-branch-details">
          Merge {5} commit{'s'} into <Ref>base branch</Ref> from{' '}
          <Ref>feature-branch</Ref>.
        </div>
      </DialogHeader>
    )
  }
}
