import * as React from 'react'
import { List } from '../list'
import { Octicon, OcticonSymbol } from '../octicons'

interface IMenuPaneProps {
  readonly items: ReadonlyArray<Electron.MenuItem>
}

const RowHeight = 30

export class MenuPane extends React.Component<IMenuPaneProps, void> {

  private renderMenuItem = (row: number) => {
    const item = this.props.items[row]

    if (item.type === 'separator') {
      return null
    }

    const arrow = item.type === 'submenu'
      ? <Octicon className='submenu-arrow' symbol={OcticonSymbol.triangleRight} />
      : null

    return (
      <div className='menu-item'>
        <div className='label'>{item.label}</div>
        {arrow}
      </div>
    )
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
