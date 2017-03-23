import * as React from 'react'

interface IAddMenuProps {
  readonly onShowAddLocalRepo: () => void
  readonly onShowCreateRepo: () => void
  readonly onShowCloneRepo: () => void
  readonly onShowCreateBranch: () => void

  readonly width: number
}

interface IAddMenuState {

}

export class AddMenu extends React.Component<IAddMenuProps, IAddMenuState> {
  public render() {
    const foldoutStyle = {
      width: this.props.width,
    }

    return (
      <div id='app-menu-foldout' style={foldoutStyle}>
        <ul className='menu-pane add-menu'>
          <li className='add-menu-item add-menu-item-header'>Repository</li>
          <li className='add-menu-item' onClick={this.props.onShowAddLocalRepo}>Add local repository</li>
          <li className='add-menu-item' onClick={this.props.onShowCreateRepo}>Create new repository</li>
          <li className='add-menu-item' onClick={this.props.onShowCloneRepo}>Clone repository</li>
          <li className='add-menu-item add-menu-item-header'>Branches</li>
          <li className='add-menu-item' onClick={this.props.onShowCreateBranch}>Create new branch</li>
        </ul>
      </div>
    )
  }
}
