import * as React from 'react'
import { List } from '../list'

interface IMenuPaneProps {
  readonly items: ReadonlyArray<Electron.MenuItem>
}

const RowHeight = 30

export class MenuPane extends React.Component<IMenuPaneProps, void> {

  private renderMenuItem = (row: number) => {
    const item = this.props.items[row]

    return <div className='menu-item'>{item.label}</div>
  }

  public render(): JSX.Element {
    return (
      <div className='menu-pane'>
        <List
          rowCount={this.props.items.length}
          rowHeight={RowHeight}
          rowRenderer={this.renderMenuItem}
          selectedRow={-1}
        />
      </div>
    )
  }
}
