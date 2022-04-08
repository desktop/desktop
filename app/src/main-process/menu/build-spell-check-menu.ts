import { app, BrowserWindow, MenuItem } from 'electron'

export async function buildSpellCheckMenu(
  window: BrowserWindow | undefined
): Promise<ReadonlyArray<MenuItem> | undefined> {
  if (window === undefined) {
    return
  }

  /*
    When a user right clicks on a misspelled word in an input, we get event from
    electron. That event comes after the context menu event that we get from the
    dom.
  */
  return new Promise(resolve => {
    window.webContents.once('context-menu', (event, params) =>
      resolve(getSpellCheckMenuItems(event, params, window.webContents))
    )
  })
}

function getSpellCheckMenuItems(
  event: Electron.Event,
  params: Electron.ContextMenuParams,
  webContents: Electron.WebContents
): ReadonlyArray<MenuItem> | undefined {
  const { misspelledWord, dictionarySuggestions } = params
  if (!misspelledWord && dictionarySuggestions.length === 0) {
    return
  }

  const items = new Array<MenuItem>()

  items.push(
    new MenuItem({
      type: 'separator',
    })
  )

  for (const suggestion of dictionarySuggestions) {
    items.push(
      new MenuItem({
        label: suggestion,
        click: () => webContents.replaceMisspelling(suggestion),
      })
    )
  }

  if (misspelledWord) {
    items.push(
      new MenuItem({
        label: __DARWIN__ ? 'Add to Dictionary' : 'Add to dictionary',
        click: () =>
          webContents.session.addWordToSpellCheckerDictionary(misspelledWord),
      })
    )
  }

  if (!__DARWIN__) {
    // NOTE: "On macOS as we use the native APIs there is no way to set the
    // language that the spellchecker uses" -- electron docs Therefore, we are
    // only allowing setting to English for non-mac machines.
    const spellCheckLanguageItem = getSpellCheckLanguageMenuItem(
      webContents.session
    )
    if (spellCheckLanguageItem !== null) {
      items.push(spellCheckLanguageItem)
    }
  }

  return items
}

/**
 * Method to get a menu item to give user the option to use English or their
 * system language.
 *
 * If system language is english, it returns null. If spellchecker is not set to
 * english, it returns item that can set it to English. If spellchecker is set
 * to english, it returns the item that can set it to their system language.
 */
function getSpellCheckLanguageMenuItem(
  session: Electron.Session
): MenuItem | null {
  const userLanguageCode = app.getLocale()
  const englishLanguageCode = 'en-US'
  const spellcheckLanguageCodes = session.getSpellCheckerLanguages()

  if (
    userLanguageCode === englishLanguageCode &&
    spellcheckLanguageCodes.includes(englishLanguageCode)
  ) {
    return null
  }

  const languageCode =
    spellcheckLanguageCodes.includes(englishLanguageCode) &&
    !spellcheckLanguageCodes.includes(userLanguageCode)
      ? userLanguageCode
      : englishLanguageCode

  const label =
    languageCode === englishLanguageCode
      ? 'Set spellcheck to English'
      : 'Set spellcheck to system language'

  return new MenuItem({
    label,
    click: () => session.setSpellCheckerLanguages([languageCode]),
  })
}
