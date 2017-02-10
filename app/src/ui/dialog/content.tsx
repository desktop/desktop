import * as React from 'react'

/**
 * A container component for content (ie non-header, non-footer) in a Dialog.
 * This component should only be used once in any given dialog.
 * 
 * If a dialog implements a tabbed interface where each tab is a child component
 * the child components _should_ render the DialogContent component themselves
 * to avoid excessive nesting and to ensure that styles applying to phrasing
 * content in the dialog get applied consistently.
 */
export class DialogContent extends React.Component<void, void> {

  public render() {
    return (
      <div className='dialog-content'>
        {this.props.children}
      </div>
    )
  }
}
