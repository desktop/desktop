import * as React from 'react'

/**
 * A terrible, horrible, no good, very bad component for presenting modal
 * popups.
 */
export default class Popuppy extends React.Component<any, any> {
  public render() {
    const style: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      zIndex: 99,
      width: '50%',
      height: '50%',
      margin: 'auto',
      backgroundColor: '#f9f9f9',
      position: 'absolute',
      boxShadow: '0 0 7px rgba(0,0,0,0.08)',
      border: '1px solid #E2E6E8',
      borderRadius: '3px'
    }
    return (
      <div style={style}>
        <div><strong><em>🔥 This is fine 🔥</em></strong></div>
        <div>&nbsp;</div>
        {this.props.children}
      </div>
    )
  }
}
