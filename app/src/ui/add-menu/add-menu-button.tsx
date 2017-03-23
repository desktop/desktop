import * as React from 'react'
import { AddMenu } from './add-menu'
import { ToolbarDropdown, DropdownState } from '../toolbar'
import { OcticonSymbol } from '../octicons'

interface IAddMenuButtonProps {
  readonly dropDownState: DropdownState
  readonly width: number
  readonly onDropDownStateChanged: (dropDownState: DropdownState) => void

  readonly onShowAddLocalRepo: () => void
  readonly onShowCreateRepo: () => void
  readonly onShowCloneRepo: () => void
  readonly onShowCreateBranch: () => void
}

export class AddMenuButton extends React.Component<IAddMenuButtonProps, void> {

  private renderAddMenu = () => {
    return (
      <AddMenu
        onShowAddLocalRepo={this.props.onShowAddLocalRepo}
        onShowCreateRepo={this.props.onShowCreateRepo}
        onShowCloneRepo={this.props.onShowCloneRepo}
        onShowCreateBranch={this.props.onShowCreateBranch}
      />
    )
  }

  public render() {

    const foldoutStyle = {
      position: 'absolute',
      marginLeft: 0,
      minWidth: this.props.width,
      height: '100%',
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
