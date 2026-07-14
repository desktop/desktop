import * as React from 'react'
import classNames from 'classnames'

interface IDialogContentProps {
  /**
   * An optional className to be applied to the rendered div element.
   */
  readonly className?: string

  /**
   * An optional function that will be passed a reference do the
   * div container element of the DialogContents component (or null if
   * unmounted).
   */
  readonly onRef?: (element: HTMLDivElement | null) => void
}

/**
 * A container component for content (ie non-header, non-footer) in a Dialog.
 * This component should only be used once in any given dialog.
 *
 * If a dialog implements a tabbed interface where each tab is a child component
 * the child components _should_ render the DialogContent component themselves
 * to avoid excessive nesting and to ensure that styles applying to phrasing
 * content in the dialog get applied consistently.
 */
export class DialogContent extends React.Component<IDialogContentProps, {}> {
  public render() {
    const className = classNames('dialog-content', this.props.className)

    return (
      <div className={className} ref={this.props.onRef}>
        {this.props.children}
      </div>
    )
  }
}
