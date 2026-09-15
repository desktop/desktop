import { describe, it } from 'node:test'
import assert from 'node:assert'
import { PopupManager } from '../../src/lib/popup-manager'
import { Account } from '../../src/models/account'
import { Popup, PopupType } from '../../src/models/popup'

describe('PopupManager', () => {
  describe('currentPopup', () => {
    it('returns null when no popups added', () => {
      const popupManager = new PopupManager()
      assert(popupManager.currentPopup === null)
    })

    it('returns last added non-error popup', () => {
      const popupManager = new PopupManager()
      popupManager.addPopup({ type: PopupType.About })
      popupManager.addPopup({ type: PopupType.SignIn })

      const currentPopup = popupManager.currentPopup
      assert(currentPopup !== null)
      assert.equal(currentPopup?.type, PopupType.SignIn)
    })

    it('returns last added error popup', () => {
      const popupManager = new PopupManager()
      popupManager.addPopup({ type: PopupType.About })
      popupManager.addErrorPopup(new Error('an error'))
      popupManager.addPopup({ type: PopupType.SignIn })

      const currentPopup = popupManager.currentPopup
      assert(currentPopup !== null)
      assert.equal(currentPopup?.type, PopupType.Error)
    })
  })

  describe('isAPopupOpen', () => {
    it('returns false when no popups added', () => {
      const popupManager = new PopupManager()
      assert(!popupManager.isAPopupOpen)
    })

    it('returns last added popup', () => {
      const popupManager = new PopupManager()
      popupManager.addPopup({ type: PopupType.About })

      const isAPopupOpen = popupManager.isAPopupOpen
      assert(isAPopupOpen)
    })
  })

  describe('getPopupsOfType', () => {
    it('returns popups of a given type', () => {
      const popupManager = new PopupManager()
      popupManager.addPopup({ type: PopupType.About })
      popupManager.addPopup({ type: PopupType.SignIn })

      const aboutPopups = popupManager.getPopupsOfType(PopupType.About)
      assert.equal(aboutPopups.length, 1)
      assert.equal(aboutPopups.at(0)?.type, PopupType.About)
    })

    it('returns empty array if none exist of given type', () => {
      const popupManager = new PopupManager()
      popupManager.addPopup({ type: PopupType.About })

      const signInPopups = popupManager.getPopupsOfType(PopupType.SignIn)
      assert.equal(signInPopups.length, 0)
    })
  })

  describe('areTherePopupsOfType', () => {
    it('returns true if popup of type exists', () => {
      const popupManager = new PopupManager()
      popupManager.addPopup({ type: PopupType.About })

      assert(popupManager.areTherePopupsOfType(PopupType.About))
    })

    it('returns false if there are no popups of that type', () => {
      const popupManager = new PopupManager()
      popupManager.addPopup({ type: PopupType.About })

      assert(!popupManager.areTherePopupsOfType(PopupType.SignIn))
    })
  })

  describe('addPopup', () => {
    it('adds a popup to the stack', () => {
      const popupManager = new PopupManager()
      popupManager.addPopup({ type: PopupType.About })

      const popupsOfType = popupManager.getPopupsOfType(PopupType.About)
      const currentPopup = popupManager.currentPopup
      assert.equal(popupsOfType.length, 1)
      assert(currentPopup !== null)
      assert.equal(currentPopup.type, PopupType.About)
    })

    it('does not add multiple popups of the same kind to the stack', () => {
      const popupManager = new PopupManager()
      const popup: Popup = { type: PopupType.About }
      popupManager.addPopup(popup)
      popupManager.addPopup(popup)

      const popupsOfType = popupManager.getPopupsOfType(PopupType.About)
      assert.equal(popupsOfType.length, 1)
    })

    it('adds multiple popups of different types', () => {
      const popupManager = new PopupManager()
      popupManager.addPopup({ type: PopupType.About })
      popupManager.addPopup({ type: PopupType.SignIn })

      const aboutPopups = popupManager.getPopupsOfType(PopupType.About)
      const signInPoups = popupManager.getPopupsOfType(PopupType.SignIn)
      assert.equal(aboutPopups.length, 1)
      assert.equal(signInPoups.length, 1)

      assert.equal(aboutPopups.at(0)?.type, PopupType.About)
      assert.equal(signInPoups.at(0)?.type, PopupType.SignIn)
    })

    it('trims oldest popup when limit is reached', () => {
      const popupManager = new PopupManager(2)
      popupManager.addPopup({ type: PopupType.About })
      popupManager.addPopup({ type: PopupType.SignIn })
      popupManager.addPopup({ type: PopupType.TermsAndConditions })

      const aboutPopups = popupManager.getPopupsOfType(PopupType.About)
      const signInPoups = popupManager.getPopupsOfType(PopupType.SignIn)
      const termsAndConditionsPoups = popupManager.getPopupsOfType(
        PopupType.TermsAndConditions
      )
      assert.equal(aboutPopups.length, 0)
      assert.equal(signInPoups.length, 1)
      assert.equal(termsAndConditionsPoups.length, 1)

      assert.equal(signInPoups.at(0)?.type, PopupType.SignIn)
      assert.equal(
        termsAndConditionsPoups.at(0)?.type,
        PopupType.TermsAndConditions
      )
    })
  })

  describe('addErrorPopup', () => {
    it('adds a popup of type error to the stack', () => {
      const popupManager = new PopupManager()
      popupManager.addErrorPopup(new Error('an error'))

      const popupsOfType = popupManager.getPopupsOfType(PopupType.Error)
      const currentPopup = popupManager.currentPopup
      assert.equal(popupsOfType.length, 1)
      assert(currentPopup !== null)
      assert.equal(currentPopup?.type, PopupType.Error)
    })

    it('adds multiple popups of type error to the stack', () => {
      const popupManager = new PopupManager()
      popupManager.addErrorPopup(new Error('an error'))
      popupManager.addErrorPopup(new Error('an error'))

      const popupsOfType = popupManager.getPopupsOfType(PopupType.Error)
      assert.equal(popupsOfType.length, 2)
    })

    it('trims oldest popup when limit is reached', () => {
      const limit = 2
      const popupManager = new PopupManager(limit)
      popupManager.addErrorPopup(new Error('an error'))
      popupManager.addErrorPopup(new Error('an error'))
      popupManager.addErrorPopup(new Error('an error'))
      popupManager.addErrorPopup(new Error('an error'))

      const errorPopups = popupManager.getPopupsOfType(PopupType.Error)
      assert.equal(errorPopups.length, limit)
    })
  })

  describe('updatePopup', () => {
    it('updates the given popup', () => {
      const mockAccount = new Account(
        'test',
        '',
        'deadbeef',
        [],
        '',
        1,
        '',
        'free'
      )
      const popupTutorial: Popup = {
        type: PopupType.CreateTutorialRepository,
        account: mockAccount,
      }

      const popupManager = new PopupManager()
      const tutorialPopup = popupManager.addPopup(popupTutorial)

      // Just so update spreader notation will work
      if (tutorialPopup.type !== PopupType.CreateTutorialRepository) {
        return
      }

      const updatedPopup: Popup = {
        ...tutorialPopup,
        progress: {
          kind: 'generic',
          value: 5,
        },
      }
      popupManager.updatePopup(updatedPopup)

      const result = popupManager.getPopupsOfType(
        PopupType.CreateTutorialRepository
      )
      assert.equal(result.length, 1)
      const resultingPopup = result.at(0)
      // Would fail first expect if not
      if (resultingPopup === undefined) {
        return
      }

      assert.equal(resultingPopup.type, PopupType.CreateTutorialRepository)
      if (resultingPopup.type !== PopupType.CreateTutorialRepository) {
        return
      }

      assert.notEqual(resultingPopup.progress, undefined)
      assert.equal(resultingPopup.progress?.kind, 'generic')
      assert.equal(resultingPopup.progress?.value, 5)
    })
  })

  describe('removePopup', () => {
    it('deletes popup when give a popup with an id', () => {
      const popupManager = new PopupManager()
      const popupAbout: Popup = popupManager.addPopup({ type: PopupType.About })
      popupManager.addPopup({ type: PopupType.SignIn })

      popupManager.removePopup(popupAbout)

      const aboutPopups = popupManager.getPopupsOfType(PopupType.About)
      assert.equal(aboutPopups.length, 0)

      const signInPopups = popupManager.getPopupsOfType(PopupType.SignIn)
      assert.equal(signInPopups.length, 1)
    })

    it('does not remove popups by type', () => {
      const popupManager = new PopupManager()
      popupManager.addPopup({ type: PopupType.About })
      popupManager.addPopup({ type: PopupType.SignIn })

      popupManager.removePopup({ type: PopupType.About })

      const aboutPopups = popupManager.getPopupsOfType(PopupType.About)
      assert.equal(aboutPopups.length, 1)

      const signInPopups = popupManager.getPopupsOfType(PopupType.SignIn)
      assert.equal(signInPopups.length, 1)
    })
  })

  describe('removePopupByType', () => {
    it('removes the popups of a given type', () => {
      const popupManager = new PopupManager()
      popupManager.addPopup({ type: PopupType.About })
      popupManager.addPopup({ type: PopupType.SignIn })

      popupManager.removePopupByType(PopupType.About)

      const aboutPopups = popupManager.getPopupsOfType(PopupType.About)
      assert.equal(aboutPopups.length, 0)

      const signInPopups = popupManager.getPopupsOfType(PopupType.SignIn)
      assert.equal(signInPopups.length, 1)
    })
  })

  describe('removePopupById', () => {
    it('removes the popup by its id', () => {
      const popupManager = new PopupManager()
      const popupAbout: Popup = popupManager.addPopup({ type: PopupType.About })
      popupManager.addPopup({ type: PopupType.SignIn })

      assert.notEqual(popupAbout.id, undefined)
      if (popupAbout.id === undefined) {
        return
      }

      popupManager.removePopupById(popupAbout.id)

      const aboutPopups = popupManager.getPopupsOfType(PopupType.About)
      assert.equal(aboutPopups.length, 0)

      const signInPopups = popupManager.getPopupsOfType(PopupType.SignIn)
      assert.equal(signInPopups.length, 1)
    })
  })

  describe('popup id increment', () => {
    it('assigns id starting at 1 for first popup', () => {
      const popupManager = new PopupManager()
      const popup = popupManager.addPopup({ type: PopupType.About })
      assert.equal(popup.id, 1)
    })

    it('increments ids sequentially for multiple popups', () => {
      const popupManager = new PopupManager()
      const popup1 = popupManager.addPopup({ type: PopupType.About })
      const popup2 = popupManager.addPopup({ type: PopupType.SignIn })
      const popup3 = popupManager.addPopup({
        type: PopupType.TermsAndConditions,
      })

      assert.equal(popup1.id, 1)
      assert.equal(popup2.id, 2)
      assert.equal(popup3.id, 3)
    })

    it('increments ids for error popups', () => {
      const popupManager = new PopupManager()
      const popup1 = popupManager.addPopup({ type: PopupType.About })
      const errorPopup = popupManager.addErrorPopup(new Error('test error'))

      assert.equal(popup1.id, 1)
      assert.equal(errorPopup.id, 2)
    })

    it('continues incrementing after popups are removed', () => {
      const popupManager = new PopupManager()
      const popup1 = popupManager.addPopup({ type: PopupType.About })
      popupManager.removePopup(popup1)
      const popup2 = popupManager.addPopup({ type: PopupType.SignIn })

      assert.equal(popup1.id, 1)
      assert.equal(popup2.id, 2)
    })
  })
})
