import {
  SpellcheckEnglishLabel,
  getSpellCheckLanguageMenuItemOptions,
  SpellcheckSystemLabel,
} from '../../../src/main-process/menu/build-spell-check-menu'
import { getAvailableSpellcheckerLanguages } from '../../helpers/menus/available-spellchecker-languages-helper'

describe('spell-checker-menu', () => {
  it('returns null menu item options when both spellchecker language and user language are english', () => {
    const spellcheckerMenuItem = getSpellCheckLanguageMenuItemOptions(
      'en-US',
      ['en-US'],
      getAvailableSpellcheckerLanguages()
    )

    expect(spellcheckerMenuItem).toBeNull()
  })

  it('returns null menu item options when spellchecker language is english, user language is not english and user language is not supported', () => {
    const spellcheckerMenuItem = getSpellCheckLanguageMenuItemOptions(
      'zh-CN',
      ['en-US'],
      getAvailableSpellcheckerLanguages()
    )

    expect(spellcheckerMenuItem).toBeNull()
  })

  it('returns set system language label when spellchecker language is english, user language is not english and user language is supported', () => {
    const spellcheckerMenuItem = getSpellCheckLanguageMenuItemOptions(
      'bg',
      ['en-US'],
      getAvailableSpellcheckerLanguages()
    )

    expect(spellcheckerMenuItem?.label).toBe(SpellcheckSystemLabel)
  })

  it('returns set to english label when spellchecker language is no english', () => {
    const spellcheckerMenuItem = getSpellCheckLanguageMenuItemOptions(
      'en-US',
      ['bg'],
      getAvailableSpellcheckerLanguages()
    )

    expect(spellcheckerMenuItem?.label).toBe(SpellcheckEnglishLabel)
  })
})
