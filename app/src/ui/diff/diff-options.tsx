import * as React from 'react'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Octicon, OcticonSymbol } from '../octicons'
import { RadioButton } from '../lib/radio-button'
import { getBoolean, setBoolean } from '../../lib/local-storage'
import FocusTrap from 'focus-trap-react'
import { Options as FocusTrapOptions } from 'focus-trap'

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
  readonly showNewCallout: boolean
}

export class DiffOptions extends React.Component<
  IDiffOptionsProps,
  IDiffOptionsState
> {
  private focusTrapOptions: FocusTrapOptions

  public constructor(props: IDiffOptionsProps) {
    super(props)
    this.state = {
      isOpen: false,
      showNewCallout: getBoolean('has-seen-split-diff-option') !== true,
    }

    this.focusTrapOptions = {
      clickOutsideDeactivates: true,
      escapeDeactivates: true,
      onDeactivate: this.closePopover,
    }
  }

  private onTogglePopover = (event: React.FormEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (this.state.isOpen) {
      this.closePopover()
    } else {
      this.openPopover()
    }
  }

  private openPopover = () => {
    this.setState(prevState => {
      if (!prevState.isOpen) {
        return { isOpen: true }
      }
      return null
    })
  }

  private closePopover = () => {
    this.setState(prevState => {
      if (prevState.isOpen) {
        if (this.state.showNewCallout) {
          setBoolean('has-seen-split-diff-option', true)
        }
        return { isOpen: false, showNewCallout: false }
      }

      return null
    })
  }

  private onHideWhitespaceChangesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    if (this.props.onHideWhitespaceChangesChanged !== undefined) {
      this.props.onHideWhitespaceChangesChanged(event.currentTarget.checked)
    }
  }

  public render() {
    return (
      <div className="diff-options-component">
        <button onClick={this.onTogglePopover}>
          <Octicon symbol={OcticonSymbol.gear} />
          <Octicon symbol={OcticonSymbol.triangleDown} />
          {this.state.showNewCallout && (
            <div className="call-to-action-bubble">New</div>
          )}
        </button>
        {this.state.isOpen && this.renderPopover()}
      </div>
    )
  }

  private renderPopover() {
    return (
      <FocusTrap active={true} focusTrapOptions={this.focusTrapOptions}>
        <div className="popover">
          {this.renderHideWhitespaceChanges()}
          {this.renderShowSideBySide()}
        </div>
      </FocusTrap>
    )
  }

  private onUnifiedSelected = () => {
    this.props.onShowSideBySideDiffChanged(false)
  }
  private onSideBySideSelected = () => {
    this.props.onShowSideBySideDiffChanged(true)
  }

  private renderShowSideBySide() {
    return (
      <section>
        <h3>
          Diff display <div className="call-to-action-bubble">Beta</div>
        </h3>
        <RadioButton
          value="Unified"
          checked={!this.props.showSideBySideDiff}
          label="Unified"
          onSelected={this.onUnifiedSelected}
        />
        <RadioButton
          value="Split"
          checked={this.props.showSideBySideDiff}
          label="Split"
          onSelected={this.onSideBySideSelected}
        />
      </section>
    )
  }

  private renderHideWhitespaceChanges() {
    if (this.props.hideWhitespaceChanges === undefined) {
      return null
    }
    return (
      <section>
        <h3>Whitespace</h3>
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
      </section>
    )
  }
}
