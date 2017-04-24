import * as React from 'react'

interface ISegmentedItem {
  readonly title: string
  readonly description?: string
}

interface IVerticalSegmentedControlProps {
  readonly items: ReadonlyArray<ISegmentedItem>
  readonly selectedIndex: number
  readonly onSelectionChanged: (selectedIndex: number) => void
}

export class VerticalSegmentedControl extends React.Component<IVerticalSegmentedControlProps, void> {
  private onItemClick = (item: ISegmentedItem) => {
    const itemIndex = this.props.items.indexOf(item)

    if (itemIndex !== this.props.selectedIndex) {
      this.props.onSelectionChanged(itemIndex)
    }
  }

  private renderItem(item: ISegmentedItem, index: number, selected: boolean) {
    return SegmentedItem(item, index, selected, this.onItemClick)
  }

  public render() {

    if (!this.props.items.length) {
      return null
    }

    const selectedIndex = this.props.selectedIndex

    return (
      <ul className='vertical-segmented-control'>
        {this.props.items.map((item, index) =>
          this.renderItem(item, index, index === selectedIndex))}
      </ul>
    )
  }
}

const SegmentedItem = (item: ISegmentedItem, index: number, selected: boolean, onClick: (index: ISegmentedItem) => void) => {
    const description = item.description
      ? <p>{item.description}</p>
      : undefined

    const className = selected ? 'selected' : undefined
    const tabIndex = selected ? 0 : -1

    return (
      <li key={index} className={className} role='button' tabIndex={tabIndex}>
        <div className='title'>{item.title}</div>
        {description}
      </li>
    )
}
