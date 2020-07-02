import * as React from 'react'

interface ISegmentedItemProps<T> {
  /**
   * An id for the item, used to assist in accessibility
   */
  readonly id: string

  /**
   * The value of the item among the other choices in the segmented
   * control. This is passed along to the onClick handler to differentiate
   * between clicked items.
   */
  readonly value: T

  /**
   * The title for the segmented item. This should be kept short.
   */
  readonly title: string

  /**
   * An optional description which explains the consequences of
   * selecting this item.
   */
  readonly description?: string | JSX.Element

  /**
   * Whether or not the item is currently the active selection among the
   * other choices in the segmented control.
   */
  readonly isSelected: boolean

  /**
   * A function that's called when a user clicks on the item using
   * a pointer device.
   */
  readonly onClick: (value: T) => void
}

export class SegmentedItem<T> extends React.Component<
  ISegmentedItemProps<T>,
  {}
> {
  private onClick = () => {
    this.props.onClick(this.props.value)
  }

  public render() {
    const description = this.props.description ? (
      <p>{this.props.description}</p>
    ) : undefined

    const isSelected = this.props.isSelected
    const className = isSelected ? 'selected' : undefined

    return (
      <li
        className={className}
        onClick={this.onClick}
        role="radio"
        id={this.props.id}
        aria-checked={isSelected ? 'true' : 'false'}
      >
        <div className="title">{this.props.title}</div>
        {description}
      </li>
    )
  }
}
