import * as React from 'react'
import { CSSTransitionGroup } from 'react-transition-group'
import { remote } from 'electron'

interface IFullScreenInfoState {
  readonly renderInfo: boolean
  readonly renderTransitionGroup: boolean
}

const transitionDuration = 100
const holdDuration = 750

export class FullScreenInfo extends React.Component<any, IFullScreenInfoState> {

  private infoDisappearTimeoutId: number | null = null
  private transitionGroupDisappearTimeoutId: number | null = null

  public constructor() {
    super()

    this.state = {
      renderInfo: false,
      renderTransitionGroup: false,
    }
  }

  public componentWillReceiveProps(nextProps: any) {
    const isFullscreen = remote.getCurrentWindow().isFullScreen()

    if (this.infoDisappearTimeoutId !== null) {
      clearTimeout(this.infoDisappearTimeoutId)
    }

    if (this.transitionGroupDisappearTimeoutId !== null) {
      clearTimeout(this.transitionGroupDisappearTimeoutId)
    }

    this.infoDisappearTimeoutId = window.setTimeout(
      this.onInfoDisappearTimeout,
      holdDuration,
    )

    this.transitionGroupDisappearTimeoutId = window.setTimeout(
      this.onTransitionGroupDisappearTimeout,
      holdDuration + transitionDuration,
    )

    this.setState({
      renderTransitionGroup: isFullscreen,
      renderInfo: isFullscreen,
    })
  }

  private onInfoDisappearTimeout = () => {
    this.setState({ renderInfo: false })
  }

  private onTransitionGroupDisappearTimeout = () => {
    this.setState({ renderTransitionGroup: false })
  }

  public render () {
    if (!this.state.renderInfo) {
      return null
    }

    return (
      <CSSTransitionGroup
        className='toast-notification-container'
        id='full-screen-info'
        transitionName='zoom-in' component='div'
        transitionAppear={true}
        transitionEnter={false}
        transitionLeave={true}
        transitionAppearTimeout={transitionDuration}
        transitionLeaveTimeout={transitionDuration}
      >
        <div className='toast-notification'>
          Press <kbd className='kbd'>Esc</kbd> or <kbd className='kbd'>F11</kbd> to exit fullscreen
        </div>
      </CSSTransitionGroup>
    )
  }
}
