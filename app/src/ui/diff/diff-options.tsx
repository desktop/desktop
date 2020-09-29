import * as React from 'react'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Octicon, OcticonSymbol } from '../octicons'

interface IDiffOptionsProps {
  readonly hideWhitespaceChanges?: boolean
  readonly onHideWhitespaceChangesChanged?: (
    hideWhitespaceChanges: boolean
  ) => void

  readonly showSideBySideDiff: boolean
  readonly onShowSideBySideDiffChanged: (showSideBySideDiff: boolean) => void
}

interface IDiffOptionsState {
  readonly isOpen: boolean
}

export class DiffOptions extends React.Component<
  IDiffOptionsProps,
  IDiffOptionsState
> {
  public constructor(props: IDiffOptionsProps) {
    super(props)
    this.state = { isOpen: false }
  }

  private onOpen = (event: React.FormEvent<HTMLButtonElement>) => {
    event.preventDefault()
    this.setState({ isOpen: !this.state.isOpen })
  }

  private onHideWhitespaceChangesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    if (this.props.onHideWhitespaceChangesChanged !== undefined) {
      this.props.onHideWhitespaceChangesChanged(event.currentTarget.checked)
    }
  }

  private onShowSideBySideDiffChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onShowSideBySideDiffChanged(event.currentTarget.checked)
  }

  public render() {
    return (
      <div className="diff-options-component">
        <button onClick={this.onOpen}>
          <Octicon symbol={OcticonSymbol.gear} />
          <div className="call-to-action-bubble">New</div>
        </button>
        {this.state.isOpen && this.renderPopover()}
      </div>
    )
  }

  private renderPopover() {
    return (
      <div className="popover">
        {this.renderHideWhitespaceChanges()}
        <Checkbox
          value={
            this.props.showSideBySideDiff ? CheckboxValue.On : CheckboxValue.Off
          }
          onChange={this.onShowSideBySideDiffChanged}
          label={__DARWIN__ ? 'Side by Side' : 'Side by side'}
        />
      </div>
    )
  }

  private renderHideWhitespaceChanges() {
    if (this.props.hideWhitespaceChanges === undefined) {
      return null
    }
    return (
      <Checkbox
        value={
          this.props.hideWhitespaceChanges
            ? CheckboxValue.On
            : CheckboxValue.Off
        }
        onChange={this.onHideWhitespaceChangesChanged}
        label={
          __DARWIN__ ? 'Hide Whitespace Changes' : 'Hide whitespace changes'
        }
      />
    )
  }
}
