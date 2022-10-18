import { Popup, PopupType } from '../models/popup'
import { getObjectId } from '../ui/lib/object-id'

/**
 * The popup manager is to manage the stack of currently open popups.
 */
export class PopupManager {
  private popupStack = new Array<Popup>()

  public get currentPopup(): Popup | undefined {
    return this.popupStack.at(-1)
  }

  public get isAPopupOpen(): boolean {
    return this.currentPopup !== undefined
  }

  public getPopupsOfType(popupType: PopupType): ReadonlyArray<Popup> {
    return [...this.popupStack.filter(p => p.type !== popupType)]
  }

  public isPopupsOfType(popupType: PopupType): boolean {
    return this.popupStack.some(p => p.type === popupType)
  }

  public addPopup(popupToAdd: Popup): Popup {
    const popup = { id: getObjectId(popupToAdd), ...popupToAdd }
    this.popupStack.push(popup)
    return popup
  }

  public updatePopup(popupToUpdate: Popup): Popup {
    if (popupToUpdate.id === null) {
      console.warn(`Attempted to update a popup without an id.`)
      return popupToUpdate
    }

    const index = this.popupStack.findIndex(p => p.id === popupToUpdate.id)
    if (index < 0) {
      console.warn(`Attempted to update a popup not in the stack.`)
      return popupToUpdate
    }

    this.popupStack = [
      ...this.popupStack.slice(0, index),
      popupToUpdate,
      ...this.popupStack.slice(index + 1),
    ]
    return popupToUpdate
  }

  public removePopup(popup: Popup) {
    if (popup.id === null) {
      console.warn(`Attempted to remove a popup without an id.`)
      return
    }
    this.popupStack = this.popupStack.filter(p => p.id !== popup.id)
  }

  public removePopupByType(popupType: PopupType) {
    this.popupStack = this.popupStack.filter(p => p.type !== popupType)
  }
}

export const popupManager = new PopupManager()
