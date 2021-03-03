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

  /** Called when the user opens the diff options popover */
  readonly onDiffOptionsOpened: () => void
}

interface IDiffOptionsState {
  readonly isOpen: boolean
  readonly showNewCallout: boolean
}

const HasSeenSplitDiffKey = 'has-seen-split-diff-option'

export class DiffOptions extends React.Component<
  IDiffOptionsProps,
  IDiffOptionsState
> {
  private focusTrapOptions: FocusTrapOptions
  private diffOptionsRef = React.createRef<HTMLDivElement>()

  public constructor(props: IDiffOptionsProps) {
    super(props)
    this.state = {
      isOpen: false,
      showNewCallout: getBoolean(HasSeenSplitDiffKey) !== true,
    }

    this.focusTrapOptions = {
      allowOutsideClick: true,
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
        document.addEventListener('mousedown', this.onDocumentMouseDown)
        this.props.onDiffOptionsOpened()
        return { isOpen: true }
      }
      return null
    })
  }

  private closePopover = () => {
    this.setState(prevState => {
      if (prevState.isOpen) {
        if (this.state.showNewCallout) {
          setBoolean(HasSeenSplitDiffKey, true)
        }
        document.removeEventListener('mousedown', this.onDocumentMouseDown)
        return { isOpen: false, showNewCallout: false }
      }

      return null
    })
  }

  public componentWillUnmount() {
    document.removeEventListener('mousedown', this.onDocumentMouseDown)
  }

  private onDocumentMouseDown = (event: MouseEvent) => {
    const { current: ref } = this.diffOptionsRef
    const { target } = event

    if (ref !== null && target instanceof Node && !ref.contains(target)) {
      this.closePopover()
    }
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
