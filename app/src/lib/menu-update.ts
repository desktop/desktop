import { MenuIDs } from '../main-process/menu'
import { merge } from './merge'

export interface IMenuItemState {
  readonly visible?: boolean,
  readonly enabled?: boolean
}

export class MenuUpdateRequest {

  private _state: { [id: string]: IMenuItemState } = { }

  public get state() {
    return this._state
  }

  private updateMenuItem<K extends keyof IMenuItemState>(id: MenuIDs, state: Pick<IMenuItemState, K>) {
    const currentState = this._state[id] || { }
    this._state[id] = merge(currentState, state)
  }

  public enable(id: MenuIDs): this {
    this.updateMenuItem(id, { enabled: true })
    return this
  }

  public disable(id: MenuIDs): this {
    this.updateMenuItem(id, { enabled: false })
    return this
  }

  public setEnabled(id: MenuIDs, enabled: boolean): this {
    this.updateMenuItem(id, { enabled })
    return this
  }

  public show(id: MenuIDs): this {
    this.updateMenuItem(id, { visible: true })
    return this
  }

  public hide(id: MenuIDs): this {
    this.updateMenuItem(id, { visible: false })
    return this
  }

  public setVisible(id: MenuIDs, visible: boolean): this {
    this.updateMenuItem(id, { visible: visible })
    return this
  }
}

export function updateMenuState() {

}
