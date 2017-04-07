import * as React from 'react'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { openShell } from '../../lib/open-shell'
import { shell } from '../../lib/dispatcher/app-shell'

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
}

/**
 * A dialog indicating that Git wasn't found, to direct the user to an
 * external resource for more information about setting up their environment.
 */
export class InstallGit extends React.Component<IInstallGitProps, void> {

  public constructor(props: IInstallGitProps) {
    super(props)
  }

  private onContinue = () => {
    openShell(this.props.path)
    this.props.onDismissed()
  }

  private onExternalLink = () => {
    // TODO: update this URL once the docs team has a better resource to reference
    const platform = __DARWIN__ ? 'mac' : 'windows'
    const url = `https://help.github.com/articles/set-up-git/#platform-${platform}`
    shell.openExternal(url)
  }

  public render() {
    return (
      <Dialog
        id='install-git'
        type='warning'
        title={__DARWIN__ ? 'Open in Terminal' : 'Op&en command prompt'}
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}>
        <DialogContent>
          <p>
            We were unable to locate Git on your system. This means the shell won't be able to execute any Git commands.
          </p>
          <p>
            Click <strong>More information</strong> to learn how to install and add Git to your shell for your operating system.
          </p>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type='submit' onClick={this.onContinue}>Continue</Button>
            <Button onClick={this.onExternalLink}>More information</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
