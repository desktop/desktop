import * as React from 'react'

import { Dialog, DialogContent } from '../dialog'

interface IEditorErrorProps {
  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void
}

/**
 * A dialog indicating something went wrong with launching an external editor,
 * with guidance to get the user back to a happy places
 */
export class EditorError extends React.Component<IEditorErrorProps, {}> {
  public constructor(props: IEditorErrorProps) {
    super(props)
  }

  public render() {
    return (
      <Dialog
        id="external-editor-error"
        type="warning"
        title={
          __DARWIN__
            ? 'Unable to Open External Editor'
            : 'Unable to open external editor'
        }
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p>Something broke with the editor, lol.</p>
        </DialogContent>
      </Dialog>
    )
  }
}
