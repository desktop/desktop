import * as React from 'react'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Octicon, OcticonSymbol } from '../octicons'
import { RadioButton } from '../lib/radio-button'
import { getBoolean, setBoolean } from '../../lib/local-storage'
import { Popover, PopoverCaretPosition } from '../lib/popover'

interface IDiffOptionsProps {
  readonly hideWhitespaceChanges?: boolean
  readonly onHideWhitespaceChangesChanged?: (
    hideWhitespaceChanges: boolean
  ) => void

  readonly showSideBySideDiff: boolean
  readonly onShowSideBySideDiffChanged: (showSideBySideDiff: boolean) => void

  /** Called when the user opens the diff options popover */
  readonly onDiffOptionsOpened: () => void
}

interface IDiffOptionsState {
  readonly isPopoverOpen: boolean
  readonly showNewCallout: boolean
}

const HasSeenSplitDiffKey = 'has-seen-split-diff-option'

export class DiffOptions extends React.Component<
  IDiffOptionsProps,
  IDiffOptionsState
> {
  private diffOptionsRef = React.createRef<HTMLDivElement>()

  public constructor(props: IDiffOptionsProps) {
    super(props)
    this.state = {
      isPopoverOpen: false,
      showNewCallout: getBoolean(HasSeenSplitDiffKey) !== true,
    }
  }

  private onButtonClick = (event: React.FormEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (this.state.isPopoverOpen) {
      this.closePopover()
    } else {
      this.openPopover()
    }
  }

  private openPopover = () => {
    this.setState(prevState => {
      if (!prevState.isPopoverOpen) {
        this.props.onDiffOptionsOpened()
        return { isPopoverOpen: true }
      }
      return null
    })
  }

  private closePopover = () => {
    this.setState(prevState => {
      if (prevState.isPopoverOpen) {
        if (this.state.showNewCallout) {
          setBoolean(HasSeenSplitDiffKey, true)
        }
        return { isPopoverOpen: false, showNewCallout: false }
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
      <div className="diff-options-component" ref={this.diffOptionsRef}>
        <button onClick={this.onButtonClick}>
          <Octicon symbol={OcticonSymbol.gear} />
          <Octicon symbol={OcticonSymbol.triangleDown} />
          {this.state.showNewCallout && (
            <div className="call-to-action-bubble">New</div>
          )}
        </button>
        {this.state.isPopoverOpen && this.renderPopover()}
      </div>
    )
  }

  private renderPopover() {
    return (
      <Popover
        caretPosition={PopoverCaretPosition.TopRight}
        onClickOutside={this.closePopover}
      >
        {this.renderHideWhitespaceChanges()}
        {this.renderShowSideBySide()}
      </Popover>
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
        <h3>Diff display</h3>
        <RadioButton
          value="Unified"
          checked={!this.props.showSideBySideDiff}
          label="Unified"
          onSelected={this.onUnifiedSelected}
        />
        <RadioButton
          value="Split"
          checked={this.props.showSideBySideDiff}
          label={
            <>
              <div>Split</div>
              <div className="call-to-action-bubble">Beta</div>
            </>
          }
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
