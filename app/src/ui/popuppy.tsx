import * as React from 'react'

export default class Popuppy extends React.Component<any, any> {
  public render() {
    const style: React.CSSProperties = {
      display: 'block',
      zIndex: 99,
      width: '50%',
      height: '50%',
      margin: 'auto',
      backgroundColor: 'red',
      position: 'absolute'
    }
    return (
      <div style={style}>
        This puppy
      </div>
    )
  }
}
