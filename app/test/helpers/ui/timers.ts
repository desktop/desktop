import { mock } from 'node:test'
import { act } from 'react-dom/test-utils'

type TimerApi = 'Date' | 'setTimeout'

export function enableTestTimers(apis: ReadonlyArray<TimerApi>, now?: number) {
  mock.timers.enable({ apis: [...apis] })

  if (now !== undefined) {
    mock.timers.setTime(now)
  }
}

export function advanceTimersBy(ms: number) {
  act(() => {
    mock.timers.tick(ms)
  })
}

export function resetTestTimers() {
  mock.timers.reset()
}
