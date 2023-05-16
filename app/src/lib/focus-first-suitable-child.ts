export const dialogExcludedInputTypes = [
  ':not([type=checkbox])',
  ':not([type=radio])',
]

interface IFocusFirstSuitableChildOptions {
  readonly excludedInputTypes: ReadonlyArray<string>
}

/**
 * Attempts to move keyboard focus to the first _suitable_ child of the
 * dialog or region.
 *
 * The original motivation for this function is that while the order of the
 * Ok, and Cancel buttons differ between platforms (see OkCancelButtonGroup)
 * we don't want to accidentally put keyboard focus on the destructive
 * button (like the Ok button in the discard changes dialog) but rather
 * on the non-destructive action. This logic originates from the macOS
 * human interface guidelines
 *
 * From https://developer.apple.com/design/human-interface-guidelines/macos/windows-and-views/dialogs/:
 *
 *   "Users sometimes press Return merely to dismiss a dialog, without
 *   reading its content, so it’s crucial that a default button initiate
 *   a harmless action. [...] when a dialog may result in a destructive
 *   action, Cancel can be set as the default button."
 *
 * The same guidelines also has this to say about focus:
 *
 *   "Set the initial focus to the first location that accepts user input.
 *    Doing so lets the user begin entering data immediately, without needing
 *    to click a specific item like a text field or list."
 *
 * In attempting to follow the guidelines outlined above we follow a priority
 * order in determining the first suitable child.
 *
 *  1. The element with the lowest positive tabIndex
 *     This might sound counterintuitive but imagine the following pseudo
 *     dialog this would be button D as button D would be the first button
 *     to get focused when hitting Tab.
 *
 *     <dialog>
 *      <button>A</button>
 *      <button tabIndex=3>B</button>
 *      <button tabIndex=2>C</button>
 *      <button tabIndex=1>D</button>
 *     </dialog>
 *
 *  2. The first element which is either implicitly keyboard focusable (like a
 *     text input field) or explicitly focusable through tabIndex=0 (like a TabBar
 *     tab)
 *
 *  3. The first submit button. We use this as a proxy for what macOS HIG calls
 *     "default button". It's not the same thing but for our purposes it's close
 *     enough.
 *
 *  4. Any remaining button
 *
 *  5. The dialog close button
 *
 */
export function focusFirstSuitableChild(
  parentElement: HTMLElement,
  options?: IFocusFirstSuitableChildOptions
) {
  const selector = [
    'input:not([type=hidden]):not(:disabled):not([tabindex="-1"])',
    'textarea:not(:disabled):not([tabindex="-1"])',
    'button:not(:disabled):not([tabindex="-1"])',
    '[tabindex]:not(:disabled):not([tabindex="-1"])',
  ].join(', ')

  // The element which has the lowest explicit tab index (i.e. greater than 0)
  let firstExplicit: { 0: number; 1: HTMLElement | null } = [Infinity, null]

  // First submit button
  let firstSubmitButton: HTMLElement | null = null

  // The first button-like element (input, submit, reset etc)
  let firstButton: HTMLElement | null = null

  // The first element which is either implicitly keyboard focusable (like a
  // text input field) or explicitly focusable through tabIndex=0 (like an
  // anchor tag masquerading as a button)
  let firstTabbable: HTMLElement | null = null

  const closeButton = parentElement.querySelector(
    ':scope > header button.close'
  )

  const defaultExcludedInputTypes = [
    ':not([type=button])',
    ':not([type=submit])',
    ':not([type=reset])',
    ':not([type=hidden])',
  ]

  const excludedInputTypes = [
    ...(options?.excludedInputTypes ?? []),
    ...defaultExcludedInputTypes,
  ]

  const inputSelector = `input${excludedInputTypes.join('')}, textarea`
  const buttonSelector =
    'input[type=button], input[type=submit] input[type=reset], button'

  const submitSelector = 'input[type=submit], button[type=submit]'

  for (const candidate of parentElement.querySelectorAll(selector)) {
    if (!(candidate instanceof HTMLElement)) {
      continue
    }

    const tabIndex = parseInt(candidate.getAttribute('tabindex') || '', 10)

    if (tabIndex > 0 && tabIndex < firstExplicit[0]) {
      firstExplicit = [tabIndex, candidate]
    } else if (
      firstTabbable === null &&
      (tabIndex === 0 || candidate.matches(inputSelector))
    ) {
      firstTabbable = candidate
    } else if (
      firstSubmitButton === null &&
      candidate.matches(submitSelector)
    ) {
      firstSubmitButton = candidate
    } else if (
      firstButton === null &&
      candidate.matches(buttonSelector) &&
      candidate !== closeButton
    ) {
      firstButton = candidate
    }
  }

  const focusCandidates = [
    firstExplicit[1],
    firstTabbable,
    firstSubmitButton,
    firstButton,
    closeButton,
  ]

  for (const focusCandidate of focusCandidates) {
    if (focusCandidate instanceof HTMLElement) {
      focusCandidate.focus()
      break
    }
  }
}
