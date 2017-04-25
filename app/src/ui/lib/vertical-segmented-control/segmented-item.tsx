import * as React from 'react'

interface ISegmentedItemProps {
  readonly id: string
  readonly index: number
  readonly title: string
  readonly description?: string
  readonly isSelected: boolean
  readonly onClick: (index: number) => void
}

export class SegmentedItem extends React.Component<ISegmentedItemProps, void> {

  private onClick = () => {
    this.props.onClick(this.props.index)
  }

  public render() {
    const description = this.props.description
      ? <p>{this.props.description}</p>
      : undefined

    const isSelected = this.props.isSelected
    const className = isSelected ? 'selected' : undefined

    return (
      <li
        className={className}
        onClick={this.onClick}
        role='radio'
        id={this.props.id}
        aria-checked={isSelected ? 'true': 'false'}
      >
        <div className='title'>{this.props.title}</div>
        {description}
      </li>
    )
  }
}
