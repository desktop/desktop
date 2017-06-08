import * as React from 'react'

interface IFullScreenInfoState {
  readonly renderInfo: boolean
}

// const holdDuration = 750

export class FullScreenInfo extends React.Component<any, IFullScreenInfoState> {

  // private infoDisappearTimeoutId: number | null = null

  public constructor() {
    super()

    this.state = {
      renderInfo: false,
    }
  }

  public render () {
    if (!this.state.renderInfo) {
      return null
    }

    return (
      <div className='toast-notification-container'>
        <div className='toast-notification'>
          Press <kbd className='kbd'>Esc</kbd> to exit fullscreen
        </div>
      </div>
    )
  }
}
