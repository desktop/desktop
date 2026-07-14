import { Dispatcher } from '../../src/ui/dispatcher'

export class InMemoryDispatcher extends Dispatcher {
  public loadInitialState(): Promise<void> {
    return Promise.resolve()
  }
}
