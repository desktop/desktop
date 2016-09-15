import * as React from 'react'

interface IUiViewProps extends React.Props<UiView> {
  id?: string
}

export class UiView extends React.Component<IUiViewProps, void> {
  public render() {
    return <div id={this.props.id} className='ui-view'>
      {this.props.children}
    </div>
  }
}
