import * as React from 'react'
import { AddMenu } from './add-menu'
import { ToolbarDropdown, DropdownState } from '../toolbar'
import { OcticonSymbol } from '../octicons'
import { MenuItem, IMenuItem, ISeparatorMenuItem } from '../../models/app-menu'
import { assertNever } from '../../lib/fatal-error'
import { getListHeight } from '../app-menu'

interface IAddMenuButtonProps {
  readonly dropDownState: DropdownState
  readonly width: number
  readonly onDropDownStateChanged: (dropDownState: DropdownState) => void

  readonly onShowAddLocalRepo: () => void
  readonly onShowCreateRepo: () => void
  readonly onShowCloneRepo: () => void
  readonly onShowCreateBranch: () => void
}

interface IAddMenuButtonState {
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

export class AddMenuButton extends React.Component<IAddMenuButtonProps, IAddMenuButtonState> {

  public constructor(props: IAddMenuButtonProps) {
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

  private onItemClicked = (item: MenuItem) => {

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

  private onSelectionChanged = (selectedItem: MenuItem) => {
    this.setState({ selectedItem })
  }

  private renderAddMenu = () => {
    return (
      <AddMenu
        items={this.state.items}
        selectedItem={this.state.selectedItem}
        onItemClicked={this.onItemClicked}
        onSelectionChanged={this.onSelectionChanged}
      />
    )
  }

  public render() {

    const menuPaneBottomPadding = 5

    const foldoutStyle = {
      position: 'absolute',
      marginLeft: 0,
      height: getListHeight(this.state.items) + menuPaneBottomPadding,
      maxHeight: '100%',
      top: 0,
    }

    return (
      <ToolbarDropdown
        icon={OcticonSymbol.plus}
        className='app-menu'
        dropdownContentRenderer={this.renderAddMenu}
        onDropdownStateChanged={this.props.onDropDownStateChanged}
        dropdownState={this.props.dropDownState}
        foldoutStyle={foldoutStyle}
      />
    )
  }
}
