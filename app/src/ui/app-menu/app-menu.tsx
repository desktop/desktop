import * as React from 'react'
import { MenuPane } from './menu-pane'

interface IAppMenuProps {
  readonly menu: Electron.Menu
}

export class AppMenu extends React.Component<IAppMenuProps, void> {

  private renderMenuPane(items: ReadonlyArray<Electron.MenuItem>) {
    return <MenuPane items={items} />
  }

  public render() {
    return (
      <div id='app-menu-foldout'>
        {this.renderMenuPane(this.props.menu.items)}
      </div>
    )
  }
}
