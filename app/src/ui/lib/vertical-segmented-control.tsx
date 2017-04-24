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
  private renderItem(item: ISegmentedItem, selected: boolean) {

    const description = item.description
      ? <p>{item.description}</p>
      : undefined

    const className = selected ? 'selected' : undefined
    const tabIndex = selected ? 0 : -1

    return (
      <li className={className} role='button' tabIndex={tabIndex}>
        <div className='title'>{item.title}</div>
        {description}
      </li>
    )
  }

  public render() {

    if (!this.props.items.length) {
      return null
    }

    const selectedIndex = this.props.selectedIndex

    return (
      <ul className='vertical-segmented-control'>
        {this.props.items.map((item, index) =>
          this.renderItem(item, index === selectedIndex))}
      </ul>
    )
  }
}
