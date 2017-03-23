import * as React from 'react'
import { MenuItem } from '../../models/app-menu'
import { MenuPane } from '../app-menu'
import { SelectionSource } from '../list'

interface IAddMenuProps {
  readonly items: ReadonlyArray<MenuItem>
  readonly onItemClicked: (item: MenuItem) => void
}

interface IAddMenuState {
  readonly selectedItem?: MenuItem
}

export class AddMenu extends React.Component<IAddMenuProps, IAddMenuState> {

  public constructor(props: IAddMenuProps) {
    super(props)
    this.state = { }
  }

  public componentWillReceiveProps(nextProps: IAddMenuProps) {
    const selectedItem = this.state.selectedItem

    if (selectedItem) {
      if (nextProps.items.indexOf(selectedItem) === -1) {
        const newSelectedItem = nextProps.items.find(x => x.id === selectedItem.id)
        this.setState({ selectedItem: newSelectedItem })
      }
    }
  }

  private onItemClicked = (depth: number, item: MenuItem, source: SelectionSource) => {
    this.props.onItemClicked(item)
  }

  private onSelectionChanged = (depth: number, selectedItem: MenuItem) => {
    this.setState({ selectedItem })
  }

  public render() {
    return <MenuPane
      depth={0}
      items={this.props.items}
      selectedItem={this.state.selectedItem}
      onItemClicked={this.onItemClicked}
      onSelectionChanged={this.onSelectionChanged}
      enableAccessKeyNavigation={false}
    />
  }
}
