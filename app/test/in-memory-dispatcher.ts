import { Dispatcher } from '../src/lib/dispatcher'

export class InMemoryDispatcher extends Dispatcher {
  public loadInitialState(): Promise<void> {
    return Promise.resolve()
  }
}
