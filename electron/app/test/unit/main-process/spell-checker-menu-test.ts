import { describe, it } from 'node:test'
import assert from 'node:assert'
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

    assert(spellcheckerMenuItem === null)
  })

  it('returns null menu item options when spellchecker language is english, user language is not english and user language is not supported', () => {
    const spellcheckerMenuItem = getSpellCheckLanguageMenuItemOptions(
      'zh-CN',
      ['en-US'],
      getAvailableSpellcheckerLanguages()
    )

    assert(spellcheckerMenuItem === null)
  })

  it('returns set system language label when spellchecker language is english, user language is not english and user language is supported', () => {
    const spellcheckerMenuItem = getSpellCheckLanguageMenuItemOptions(
      'bg',
      ['en-US'],
      getAvailableSpellcheckerLanguages()
    )

    assert.equal(spellcheckerMenuItem?.label, SpellcheckSystemLabel)
  })

  it('returns set to english label when spellchecker language is no english', () => {
    const spellcheckerMenuItem = getSpellCheckLanguageMenuItemOptions(
      'en-US',
      ['bg'],
      getAvailableSpellcheckerLanguages()
    )

    assert.equal(spellcheckerMenuItem?.label, SpellcheckEnglishLabel)
  })
})
