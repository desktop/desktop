import * as React from 'react'

export class FullScreenInfo extends React.Component<any, any> {
  public render () {
    return (
      <div className='toast-notification-container'>
        <div className='toast-notification'>
          Press <kbd className='kbd'>Esc</kbd> to exit fullscreen
        </div>
      </div>
    )
  }
}
