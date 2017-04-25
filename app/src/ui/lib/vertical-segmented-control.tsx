import * as React from 'react'

interface ISegmentedItem {
  readonly title: string
  readonly description?: string
}

interface IVerticalSegmentedControlProps {
  readonly label?: string
  readonly items: ReadonlyArray<ISegmentedItem>
  readonly selectedIndex: number
  readonly onSelectionChanged: (selectedIndex: number) => void
}

export class VerticalSegmentedControl extends React.Component<IVerticalSegmentedControlProps, void> {
  private onItemClick = (index: number) => {
    if (index !== this.props.selectedIndex) {
      this.props.onSelectionChanged(index)
    }
  }

  private renderItem(item: ISegmentedItem, index: number, selected: boolean) {
    return (
      <SegmentedItem
        key={index}
        title={item.title}
        description={item.description}
        index={index}
        isSelected={selected}
        onClick={this.onItemClick}
      />
    )
  }

  public render() {

    if (!this.props.items.length) {
      return null
    }

    const selectedIndex = this.props.selectedIndex
    const label = this.props.label
      ? <label>{this.props.label}</label>
      : undefined

    return (
      <div className='vertical-segmented-control'>
        {label}
        <ul className='vertical-segmented-control'>
          {this.props.items.map((item, index) =>
            this.renderItem(item, index, index === selectedIndex))}
        </ul>
      </div>
    )
  }
}

interface ISegmentedItemProps {
  readonly index: number
  readonly title: string
  readonly description?: string
  readonly isSelected: boolean
  readonly onClick: (index: number) => void
}

class SegmentedItem extends React.Component<ISegmentedItemProps, void> {

  private onClick = () => {
    this.props.onClick(this.props.index)
  }

  public render() {
    const description = this.props.description
      ? <p>{this.props.description}</p>
      : undefined

    const className = this.props.isSelected ? 'selected' : undefined
    const tabIndex = this.props.isSelected ? 0 : -1

    return (
      <li
        className={className}
        role='button'
        tabIndex={tabIndex}
        onClick={this.onClick}
      >
        <div className='title'>{this.props.title}</div>
        {description}
      </li>
    )
  }
}
