import React from 'react'

const eventNames = new Set<keyof WindowEventMap>([
  // WindowEventMap
  'DOMContentLoaded',
  'devicemotion',
  'deviceorientation',
  'gamepadconnected',
  'gamepaddisconnected',
  'orientationchange',

  // GlobalEventHandlersEventMap
  'abort',
  'animationcancel',
  'animationend',
  'animationiteration',
  'animationstart',
  'auxclick',
  'beforeinput',
  'blur',
  'canplay',
  'canplaythrough',
  'change',
  'click',
  'close',
  'compositionend',
  'compositionstart',
  'compositionupdate',
  'contextmenu',
  'cuechange',
  'dblclick',
  'drag',
  'dragend',
  'dragenter',
  'dragleave',
  'dragover',
  'dragstart',
  'drop',
  'durationchange',
  'emptied',
  'ended',
  'error',
  'focus',
  'focusin',
  'focusout',
  'formdata',
  'gotpointercapture',
  'input',
  'invalid',
  'keydown',
  'keypress',
  'keyup',
  'load',
  'loadeddata',
  'loadedmetadata',
  'loadstart',
  'lostpointercapture',
  'mousedown',
  'mouseenter',
  'mouseleave',
  'mousemove',
  'mouseout',
  'mouseover',
  'mouseup',
  'pause',
  'play',
  'playing',
  'pointercancel',
  'pointerdown',
  'pointerenter',
  'pointerleave',
  'pointermove',
  'pointerout',
  'pointerover',
  'pointerup',
  'progress',
  'ratechange',
  'reset',
  'resize',
  'scroll',
  'securitypolicyviolation',
  'seeked',
  'seeking',
  'select',
  'selectionchange',
  'selectstart',
  'slotchange',
  'stalled',
  'submit',
  'suspend',
  'timeupdate',
  'toggle',
  'touchcancel',
  'touchend',
  'touchmove',
  'touchstart',
  'transitioncancel',
  'transitionend',
  'transitionrun',
  'transitionstart',
  'volumechange',
  'waiting',
  'webkitanimationend',
  'webkitanimationiteration',
  'webkitanimationstart',
  'webkittransitionend',
  'wheel',

  // WindowEventHandlersEventMap
  'afterprint',
  'beforeprint',
  'beforeunload',
  'gamepadconnected',
  'gamepaddisconnected',
  'hashchange',
  'languagechange',
  'message',
  'messageerror',
  'offline',
  'online',
  'pagehide',
  'pageshow',
  'popstate',
  'rejectionhandled',
  'storage',
  'unhandledrejection',
  'unload',
])

type Props = {
  [K in keyof WindowEventMap]?: (this: Window, ev: WindowEventMap[K]) => any
}

export class WindowEvents extends React.Component<Props> {
  private static updateSubscriptions(props: Props, prevProps?: Props) {
    for (const eventName of eventNames) {
      this.updateSubscription(eventName, props, prevProps)
    }
  }

  private static updateSubscription<K extends keyof WindowEventMap>(
    eventName: K,
    props: Props,
    prevProps?: Props
  ) {
    const previousEvent = prevProps?.[eventName]
    const currentEvent = props[eventName]

    if (currentEvent !== previousEvent) {
      if (previousEvent) {
        window.removeEventListener(eventName, previousEvent)
      }

      if (currentEvent) {
        window.addEventListener(eventName, currentEvent)
      }
    }
  }

  public componentDidMount(): void {
    WindowEvents.updateSubscriptions(this.props)
  }

  public componentDidUpdate(prevProps: Props): void {
    WindowEvents.updateSubscriptions(this.props, prevProps)
  }

  public componentWillUnmount(): void {
    WindowEvents.updateSubscriptions({}, this.props)
  }

  public render() {
    return null
  }
}
