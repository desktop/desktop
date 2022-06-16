import { getSpellCheckLanguageMenuItemOptions } from '../../../src/main-process/menu/build-spell-check-menu'
import { getAvailableSpellcheckerLanguages } from '../../helpers/menus/available-spellchecker-languages-helper'

describe('spell-checker-menu', () => {
  it('spell checker language is english && user language is english', () => {
    const spellcheckerLanguage = ['en-US']
    const userLanguageCode = 'en-US'

    const spellcheckerMenuItem = getSpellCheckLanguageMenuItemOptions(
      userLanguageCode,
      spellcheckerLanguage,
      getAvailableSpellcheckerLanguages()
    )

    expect(spellcheckerMenuItem).toBeNull()
  })

  it('spell checker language is english && user language is not english && user language is not supported', () => {
    const spellcheckerLanguage = ['en-US']
    const userLanguageCode = 'zh-CN'

    const spellcheckerMenuItem = getSpellCheckLanguageMenuItemOptions(
      userLanguageCode,
      spellcheckerLanguage,
      getAvailableSpellcheckerLanguages()
    )

    expect(spellcheckerMenuItem).toBeNull()
  })

  it('spell checker language is english && user language is not english && user language is supported', () => {
    const spellcheckerLanguage = ['en-US']
    const userLanguageCode = 'bg'

    const spellcheckerMenuItem = getSpellCheckLanguageMenuItemOptions(
      userLanguageCode,
      spellcheckerLanguage,
      getAvailableSpellcheckerLanguages()
    )

    expect(spellcheckerMenuItem?.label).toBe(
      'Set spellcheck to system language'
    )
  })

  it('spell checker language is no english', () => {
    const spellcheckerLanguage = ['bg']
    const userLanguageCode = 'en-US'

    const spellcheckerMenuItem = getSpellCheckLanguageMenuItemOptions(
      userLanguageCode,
      spellcheckerLanguage,
      getAvailableSpellcheckerLanguages()
    )

    expect(spellcheckerMenuItem?.label).toBe('Set spellcheck to English')
  })
})
