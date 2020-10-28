import * as React from 'react'
import { TextBox } from '../lib/text-box'

interface IDiffSearchInputProps {
  /**
   * Called when the user indicated that they either want to initiate a search
   * or want to advance to the next hit (typically done by hitting `Enter`).
   */
  readonly onSearch: (query: string, direction: 'next' | 'previous') => void

  /**
   * Called when the user indicates that they want to abort the search,
   * either by clicking outside of the component or by hitting `Escape`.
   */
  readonly onClose: () => void
}

interface IDiffSearchInputState {
  readonly value: string
}

export class DiffSearchInput extends React.Component<
  IDiffSearchInputProps,
  IDiffSearchInputState
> {
  public constructor(props: IDiffSearchInputProps) {
    super(props)
    this.state = { value: '' }
  }

  public render() {
    return (
      <div className="diff-search">
        <TextBox
          placeholder="Search..."
          type="search"
          autoFocus={true}
          onValueChanged={this.onChange}
          onKeyDown={this.onKeyDown}
          onBlur={this.onBlur}
          value={this.state.value}
        />
      </div>
    )
  }

  private onChange = (value: string) => {
    this.setState({ value })
  }

  private onBlur = () => {
    this.props.onClose()
  }

  private onKeyDown = (evt: React.KeyboardEvent<HTMLInputElement>) => {
    if (evt.key === 'Escape' && !evt.defaultPrevented) {
      evt.preventDefault()
      this.props.onClose()
    } else if (evt.key === 'Enter' && !evt.defaultPrevented) {
      evt.preventDefault()
      this.props.onSearch(this.state.value, evt.shiftKey ? 'previous' : 'next')
    }
  }
}
