import * as React from 'react'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { shell } from '../../lib/app-shell'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IInstallGitProps {
  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void

  /**
   * The path to the current repository, in case the user wants to continue
   * doing whatever they're doing.
   */
  readonly path: string

  /** Called when the user chooses to open the shell. */
  readonly onOpenShell: (path: string) => void
}

/**
 * A dialog indicating that Git wasn't found, to direct the user to an
 * external resource for more information about setting up their environment.
 */
export class InstallGit extends React.Component<IInstallGitProps, {}> {
  public constructor(props: IInstallGitProps) {
    super(props)
  }

  private onSubmit = () => {
    this.props.onOpenShell(this.props.path)
    this.props.onDismissed()
  }

  private onExternalLink = (e: React.MouseEvent<HTMLButtonElement>) => {
    const url = `https://help.github.com/articles/set-up-git/#setting-up-git`
    shell.openExternal(url)
  }

  public render() {
    return (
      <Dialog
        id="install-git"
        type="warning"
        title={__DARWIN__ ? 'Unable to Locate Git' : 'Unable to locate Git'}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p>
            We were unable to locate Git on your system. This means you won't be
            able to execute any Git commands in the{' '}
            {__DARWIN__ ? 'Terminal window' : 'command prompt'}.
          </p>
          <p>
            To help you get Git installed and configured for your operating
            system, we have some external resources available.
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Open Without Git' : 'Open without Git'}
            cancelButtonText="Install Git"
            onCancelButtonClick={this.onExternalLink}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
