import * as React from 'react'
import { Octicon, OcticonSymbolType } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import classNames from 'classnames'

interface ITagsInputProps {
  /** Icon to render */
  readonly symbol?: OcticonSymbolType

  /** The value of the input. */
  readonly values: ReadonlyArray<string>

  /** Called when the user changes the selected valued. */
  readonly onChange?: (value: ReadonlyArray<string>) => void
}

interface ITagsInputState {
  readonly isFocused: boolean
  readonly tags: ReadonlyArray<string>
}

export class TagsInput extends React.Component<
  ITagsInputProps,
  ITagsInputState
> {
  public constructor(props: ITagsInputProps) {
    super(props)

    this.state = { isFocused: false, tags: props.values }
  }

  private onTagBoxFocused = () => {
    this.setState({ isFocused: true })
  }

  private onBlur = () => {
    this.setState({ isFocused: false })
  }

  private onTagRemoved = (index: number) => {
    return () => {
      const tags = [...this.state.tags]
      tags.splice(index, 1)
      this.setState({ tags })
      this.props.onChange?.(tags)
    }
  }

  private renderTag = (tag: string, index: number) => {
    return (
      <span className="tag" key={index}>
        {tag}
        <span className="remove" onClick={this.onTagRemoved(index)}>
          <Octicon symbol={OcticonSymbol.x} />
        </span>
      </span>
    )
  }

  public render() {
    const { isFocused, tags } = this.state
    const classes = classNames('tags-input-component', {
      focused: isFocused,
    })
    return (
      <div
        className={classes}
        tabIndex={1}
        onClick={this.onTagBoxFocused}
        onFocus={this.onTagBoxFocused}
        onBlur={this.onBlur}
      >
        {this.props.symbol !== undefined ? (
          <Octicon className="tags-input-octicon" symbol={this.props.symbol} />
        ) : null}
        <div className="tag-box">
          {tags.map((v, i) => this.renderTag(v, i))}
        </div>
      </div>
    )
  }
}
