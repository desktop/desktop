import * as React from 'react'

/**
 * A terrible, horrible, no good, very bad component for presenting modal
 * popups.
 */
export default class Popuppy extends React.Component<any, any> {
  public render() {
    return (
      <div className='popup'>
        <div className='panel popup-content'>
          {this.props.children}
        </div>
      </div>
    )
  }
}
