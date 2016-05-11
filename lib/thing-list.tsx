import * as React from 'react'

import List from './list'

type ThingListProps = {
  selectedRow: number,
  onSelectionChanged: (row: number) => void
}

const RowHeight = 44

export default class ThingList extends React.Component<ThingListProps, void> {
  public constructor(props: ThingListProps) {
    super(props)
  }

  private renderRow(row: number): JSX.Element {
    const selected = row === this.props.selectedRow
    const inlineStyle = {
      display: 'flex',
      flexDirection: 'column',
      padding: 4,
      backgroundColor: selected ? 'blue' : 'white',
      color: selected ? 'white' : 'black',
      height: RowHeight
    }
    const whiteness = 140
    return (
      <div style={inlineStyle} key={row.toString()}>
        <div>Item {row + 1}</div>
        <div style={{
          fontSize: '0.8em',
          color: selected ? 'white' : `rgba(${whiteness}, ${whiteness}, ${whiteness}, 1)`
        }}>Some subtitle</div>
      </div>
    )
  }

  public render() {
    return (
      <List itemCount={10000}
            itemHeight={RowHeight}
            renderItem={row => this.renderRow(row)}
            selectedRow={this.props.selectedRow}
            onSelectionChanged={row => this.props.onSelectionChanged(row)}
            style={{width: 120}}/>
    )
  }
}
