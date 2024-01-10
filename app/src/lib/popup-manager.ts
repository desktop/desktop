import { Popup, PopupType } from '../models/popup'
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
 *
 * Popup Flow Notes:
 * 1. We have many types of popups. We only support opening one popup type at a
 *    time with the exception of PopupType.Error. If the app is to produce
 *    multiple errors, we want the user to be able to be informed of all them.
 * 2. Error popups are viewed first ahead of any other popup types. Otherwise,
 *    popups ordered by last on last off.
 * 3. There are custom error handling popups that are not categorized as errors:
 *     - When a error is captured in the app, we use the dispatcher method
 *       'postError` to run through all the error handlers defined in
 *       `errorHandler.ts`.
 *     - If a custom error handler picks the error up, it handles it in a custom
 *       way. Commonly, it users the dispatcher to open a popup specific to the
 *       error - likely to allow interaction with the user. This is not an error
 *       popup.
 *    -  Otherwise, the error is captured by the `defaultErrorHandler` defined
 *       in `errorHandler.ts` which simply dispatches to `presentError`. This
 *       method requests ends up in the app-store to add a popup of type `Error`
 *       to the stack. Then, it is rendered as a popup with the AppError
 *       component.
 *    - The AppError component additionally does some custom error handling for
 *      cloning errors and for author errors. But, most errors are just
 *      displayed as error text with a ok button.
 */
export class PopupManager {
  private popupStack: ReadonlyArray<Popup> = []

  public constructor(private readonly popupLimit = defaultPopupStackLimit) {}

  /**
   * Returns the last popup in the stack.
   *
   * The stack is sorted such that:
   *  If there are error popups, it returns the last popup of type error,
   *  otherwise returns the first non-error type popup.
   */
  public get currentPopup(): Popup | null {
    return this.popupStack.at(-1) ?? null
  }

  /**
   * Returns all the popups in the stack.
   *
   * The stack is sorted such that:
   *  If there are error popups, they will be the last on the stack.
   */
  public get allPopups(): ReadonlyArray<Popup> {
    return this.popupStack
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
   * - It will not add multiple popups of the same type onto the stack
   *   - NB: Error types are the only duplicates allowed
   **/
  public addPopup(popupToAdd: Popup): Popup {
    if (popupToAdd.type === PopupType.Error) {
      return this.addErrorPopup(popupToAdd.error)
    }

    const existingPopup = this.getPopupsOfType(popupToAdd.type)

    const popup = { id: uuid(), ...popupToAdd }

    if (existingPopup.length > 0) {
      log.warn(
        `Attempted to add a popup of already existing type - ${popupToAdd.type}.`
      )
      return popupToAdd
    }

    this.insertBeforeErrorPopups(popup)
    this.checkStackLength()
    return popup
  }

  /** Adds a non-Error type popup before any error popups. */
  private insertBeforeErrorPopups(popup: Popup) {
    if (this.popupStack.at(-1)?.type !== PopupType.Error) {
      this.popupStack = this.popupStack.concat(popup)
      return
    }

    const errorPopups = this.getPopupsOfType(PopupType.Error)
    const nonErrorPopups = this.popupStack.filter(
      p => p.type !== PopupType.Error
    )
    this.popupStack = [...nonErrorPopups, popup, ...errorPopups]
  }

  /*
   * Adds an Error Popup to the stack
   * - The popup will be given a unique id.
   * - Multiple popups of a type error.
   **/
  public addErrorPopup(error: Error): Popup {
    const popup: Popup = { id: uuid(), type: PopupType.Error, error }
    this.popupStack = this.popupStack.concat(popup)
    this.checkStackLength()
    return popup
  }

  private checkStackLength() {
    if (this.popupStack.length > this.popupLimit) {
      // Remove the oldest
      const oldest = this.popupStack[0]
      const oldestError =
        oldest.type === PopupType.Error ? `: ${oldest.error.message}` : null
      const justAddedError =
        this.currentPopup?.type === PopupType.Error
          ? `Just added another Error: ${this.currentPopup.error.message}.`
          : null
      sendNonFatalException(
        'TooManyPopups',
        new Error(
          `Max number of ${this.popupLimit} popups reached while adding popup of type ${this.currentPopup?.type}.
          Removing last popup from the stack. Type ${oldest.type}${oldestError}.
          ${justAddedError}`
        )
      )
      this.popupStack = this.popupStack.slice(1)
    }
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

  /**
   * Removes popup from the stack by it's id
   */
  public removePopupById(popupId: string) {
    this.popupStack = this.popupStack.filter(p => p.id !== popupId)
  }
}
