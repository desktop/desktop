import * as React from 'react'
import { MenuItem, IMenuItem, ISeparatorMenuItem } from '../../models/app-menu'
import { MenuPane } from '../app-menu'
import { SelectionSource } from '../list'
import { assertNever } from '../../lib/fatal-error'

interface IAddMenuProps {
  readonly onShowAddLocalRepo: () => void
  readonly onShowCreateRepo: () => void
  readonly onShowCloneRepo: () => void
  readonly onShowCreateBranch: () => void
}

interface IAddMenuState {
  readonly items: ReadonlyArray<IMenuItem | ISeparatorMenuItem>
  readonly selectedItem?: MenuItem
}

type MenuItemId = 'add-local-repo' | 'create-repo' | 'clone-repo' | 'create-branch'

function createMenuItem(id: MenuItemId, label: string): IMenuItem {
  return {
    type: 'menuItem',
    id,
    label: label,
    enabled: true,
    visible: true,
    accelerator: null,
    accessKey: null,
  }
}

export class AddMenu extends React.Component<IAddMenuProps, IAddMenuState> {

  public constructor(props: IAddMenuProps) {
    super(props)

    this.state = {
      items: [
        createMenuItem('add-local-repo', __DARWIN__ ? 'Add Local Repository' : 'Add local repository'),
        createMenuItem('create-repo', __DARWIN__ ? 'Create New Repository' : 'Create new repository'),
        createMenuItem('clone-repo', __DARWIN__ ? 'Clone Repository' : 'Clone repository'),
        { id: 'sep', type: 'separator', visible: true },
        createMenuItem('create-branch', __DARWIN__ ? 'Create Branch' : 'Create branch'),
      ],
    }
  }

  private onItemClicked = (depth: number, item: MenuItem, source: SelectionSource) => {

    const id = item.id as MenuItemId

    switch (id) {
      case 'add-local-repo':
        this.props.onShowAddLocalRepo()
        break
      case 'create-repo':
        this.props.onShowCreateRepo()
        break
      case 'clone-repo':
        this.props.onShowCloneRepo()
        break
      case 'create-branch':
        this.props.onShowCreateBranch()
        break
      default:
        assertNever(id, `Unknown menu item id: ${id}`)
    }
  }

  private onSelectionChanged = (depth: number, selectedItem: MenuItem, source: SelectionSource) => {
    this.setState({ selectedItem })
  }

  public render() {
    return <MenuPane
      depth={0}
      items={this.state.items}
      selectedItem={this.state.selectedItem}
      onItemClicked={this.onItemClicked}
      onSelectionChanged={this.onSelectionChanged}
      enableAccessKeyNavigation={false}
    />
  }
}
