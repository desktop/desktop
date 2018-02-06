import * as React from 'react'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { shell } from '../../lib/app-shell'

interface IEditorErrorProps {
  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void

  /**
   * Event to trigger if the user navigates to the Preferences dialog
   */
  readonly showPreferencesDialog: () => void

  /**
   * The text to display to the user relating to this error.
   */
  readonly message: string

  /** Render the "Install Atom" link as the default action */
  readonly suggestAtom?: boolean

  /** Render the "Open Preferences" link as the default action */
  readonly viewPreferences?: boolean
}

/**
 * A dialog indicating something went wrong with launching an external editor,
 * with guidance to get the user back to a happy places
 */
export class EditorError extends React.Component<IEditorErrorProps, {}> {
  public constructor(props: IEditorErrorProps) {
    super(props)
  }

  private onExternalLink = () => {
    const url = `https://atom.io/`
    shell.openExternal(url)
  }

  private onShowPreferencesDialog = () => {
    this.props.onDismissed()
    this.props.showPreferencesDialog()
  }

  public render() {
    const title = __DARWIN__
      ? 'Unable to Open External Editor'
      : 'Unable to open external editor'

    let buttonGroup: JSX.Element | null = null
    if (this.props.viewPreferences) {
      buttonGroup = (
        <ButtonGroup>
          <Button type="submit" onClick={this.props.onDismissed}>
            Close
          </Button>
          <Button onClick={this.onShowPreferencesDialog}>
            {__DARWIN__ ? 'Open Preferences' : 'Open options'}
          </Button>
        </ButtonGroup>
      )
    } else if (this.props.suggestAtom) {
      buttonGroup = (
        <ButtonGroup>
          <Button type="submit" onClick={this.props.onDismissed}>
            Close
          </Button>
          <Button onClick={this.onExternalLink}>Download Atom</Button>
        </ButtonGroup>
      )
    }

    return (
      <Dialog
        id="external-editor-error"
        type="error"
        title={title}
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p>{this.props.message}</p>
        </DialogContent>
        <DialogFooter>{buttonGroup}</DialogFooter>
      </Dialog>
    )
  }
}
