import * as React from 'react'

export default class Popuppy extends React.Component<any, any> {
  public render() {
    const style: React.CSSProperties = {
      display: 'block',
      zIndex: 99,
      width: '50%',
      height: '50%',
      margin: 'auto',
      backgroundColor: 'rgb(255, 210, 210)',
      position: 'absolute'
    }
    return (
      <div style={style}>
        <div><strong>🔥 This is fine 🔥</strong></div>
        <div>&nbsp;</div>
        {this.props.children}
      </div>
    )
  }
}
