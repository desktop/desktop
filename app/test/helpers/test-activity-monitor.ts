import {
  UiActivityKind,
  IUiActivityMonitor,
} from '../../src/ui/lib/ui-activity-monitor'
import { Emitter, Disposable } from 'event-kit'

export class TestActivityMonitor implements IUiActivityMonitor {
  private readonly emitter = new Emitter()
  public subscriptionCount = 0

  public onActivity(handler: (kind: UiActivityKind) => void) {
    this.subscriptionCount++

    const disp = this.emitter.on('activity', handler)

    return new Disposable(() => {
      disp.dispose()
      this.subscriptionCount--
    })
  }

  private emit(kind: UiActivityKind) {
    this.emitter.emit('activity', kind)
  }

  public fakeMouseActivity() {
    this.emit('pointer')
  }

  public fakeKeyboardActivity() {
    this.emit('keyboard')
  }

  public fakeMenuActivity() {
    this.emit('menu')
  }
}
