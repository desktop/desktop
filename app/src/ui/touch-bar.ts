import { TouchBar, remote } from 'electron'

const touchBars = new Array<TouchBar | null>()
const win = remote.getCurrentWindow()

function getTouchBar(): TouchBar | null {
  for (let i = touchBars.length - 1; i >= 0; i--) {
    if (touchBars[i]) {
      return touchBars[i]
    }
  }
  return null
}

export function addTouchBar(bar: TouchBar): number {
  touchBars.push(bar)
  win.setTouchBar(getTouchBar())
  return touchBars.length - 1
}

export function updateTouchBar(id: number, bar: TouchBar) {
  touchBars[id] = bar
  win.setTouchBar(getTouchBar())
}

export function removeTouchBar(id: number) {
  touchBars[id] = null
  win.setTouchBar(getTouchBar())
}
