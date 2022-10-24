import { Popup, PopupType } from '../models/popup'
import { enableStackedPopups } from './feature-flag'
import { sendNonFatalException } from './helpers/non-fatal-exception'
import { uuid } from './uuid'

/**
 * The limit of how many popups allowed in the stack. Working under the
 * assumption that a user should only be dealing with a couple of popups at a
 * time, if a user hits the limit this would indicate a problem.
 */
const defaultPopupStackLimit = 50

/**
 * The popup manager is to manage the stack of currently open popups.
 */
export class PopupManager {
  private popupStack = new Array<Popup>()

  public constructor(private readonly popupLimit = defaultPopupStackLimit) {}

  /**
   * Returns the last popup added to the stack.
   */
  public get currentPopup(): Popup | null {
    return this.popupStack.at(-1) ?? null
  }

  /**
   * Returns whether there are any popups in the stack.
   */
  public get isAPopupOpen(): boolean {
    return this.currentPopup !== null
  }

  /**
   * Returns an array of all popups in the stack of the provided type.
   **/
  public getPopupsOfType(popupType: PopupType): ReadonlyArray<Popup> {
    return this.popupStack.filter(p => p.type === popupType)
  }

  /**
   * Returns whether there are any popups of a given type in the stack.
   */
  public areTherePopupsOfType(popupType: PopupType): boolean {
    return this.popupStack.some(p => p.type === popupType)
  }

  /**
   * Adds a popup to the stack.
   * - The popup will be given a unique id and returned.
   * - It will not add multiple popups of the same type to the stack
   **/
  public addPopup(popupToAdd: Popup): Popup {
    const existingPopup = this.getPopupsOfType(popupToAdd.type)

    if (!enableStackedPopups()) {
      this.popupStack = [popupToAdd]
      return popupToAdd
    }

    if (existingPopup.length > 0) {
      log.warn(
        `Attempted to add a popup of already existing type - ${popupToAdd.type}.`
      )
      return popupToAdd
    }

    const popup = { id: uuid(), ...popupToAdd }
    this.popupStack.push(popup)

    if (this.popupStack.length > this.popupLimit) {
      // Remove the oldest
      const oldest = this.popupStack[0]
      sendNonFatalException(
        'TooManyPopups',
        new Error(
          `Max number of ${this.popupLimit} popups reached while adding popup of type ${popup.type}. Removing last popup from the stack -> type ${oldest.type} `
        )
      )
      this.popupStack = this.popupStack.slice(1)
    }
    return popup
  }

  /**
   * Updates a popup in the stack and returns it.
   * - It uses the popup id to find and update the popup.
   */
  public updatePopup(popupToUpdate: Popup) {
    if (popupToUpdate.id === undefined) {
      log.warn(`Attempted to update a popup without an id.`)
      return
    }

    const index = this.popupStack.findIndex(p => p.id === popupToUpdate.id)
    if (index < 0) {
      log.warn(`Attempted to update a popup not in the stack.`)
      return
    }

    this.popupStack = [
      ...this.popupStack.slice(0, index),
      popupToUpdate,
      ...this.popupStack.slice(index + 1),
    ]
  }

  /**
   * Removes a popup based on it's id.
   */
  public removePopup(popup: Popup) {
    if (popup.id === undefined) {
      log.warn(`Attempted to remove a popup without an id.`)
      return
    }
    this.popupStack = this.popupStack.filter(p => p.id !== popup.id)
  }

  /**
   * Removes any popup of the given type from the stack
   */
  public removePopupByType(popupType: PopupType) {
    this.popupStack = this.popupStack.filter(p => p.type !== popupType)
  }
}
