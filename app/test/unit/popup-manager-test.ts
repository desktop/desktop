import { PopupManager } from '../../src/lib/popup-manager'
import { Account } from '../../src/models/account'
import { Popup, PopupType } from '../../src/models/popup'

let mockId = 0
jest.mock('../../src/lib/uuid', () => {
  return { uuid: () => mockId++ }
})

describe('PopupManager', () => {
  let popupManager = new PopupManager()

  beforeEach(() => {
    popupManager = new PopupManager()
    mockId = 0
  })

  describe('currentPopup', () => {
    it('returns null when no popups added', () => {
      const currentPopup = popupManager.currentPopup
      expect(currentPopup).toBeNull()
    })

    it('returns last added non-error popup', () => {
      const popupAbout: Popup = { type: PopupType.About }
      const popupSignIn: Popup = { type: PopupType.SignIn }
      popupManager.addPopup(popupAbout)
      popupManager.addPopup(popupSignIn)

      const currentPopup = popupManager.currentPopup
      expect(currentPopup).not.toBeNull()
      expect(currentPopup?.type).toBe(PopupType.SignIn)
    })

    it('returns last added error popup', () => {
      const popupAbout: Popup = { type: PopupType.About }
      const popupSignIn: Popup = { type: PopupType.SignIn }
      popupManager.addPopup(popupAbout)
      popupManager.addErrorPopup(new Error('an error'))
      popupManager.addPopup(popupSignIn)

      const currentPopup = popupManager.currentPopup
      expect(currentPopup).not.toBeNull()
      expect(currentPopup?.type).toBe(PopupType.Error)
    })
  })

  describe('isAPopupOpen', () => {
    it('returns false when no popups added', () => {
      const isAPopupOpen = popupManager.isAPopupOpen
      expect(isAPopupOpen).toBeFalse()
    })

    it('returns last added popup', () => {
      const popupAbout: Popup = { type: PopupType.About }
      popupManager.addPopup(popupAbout)

      const isAPopupOpen = popupManager.isAPopupOpen
      expect(isAPopupOpen).toBeTrue()
    })
  })

  describe('getPopupsOfType', () => {
    it('returns popups of a given type', () => {
      const popupAbout: Popup = { type: PopupType.About }
      const popupSignIn: Popup = { type: PopupType.SignIn }
      popupManager.addPopup(popupAbout)
      popupManager.addPopup(popupSignIn)

      const aboutPopups = popupManager.getPopupsOfType(PopupType.About)
      expect(aboutPopups).toBeArrayOfSize(1)
      expect(aboutPopups.at(0)?.type).toBe(PopupType.About)
    })

    it('returns empty array if none exist of given type', () => {
      const popupAbout: Popup = { type: PopupType.About }
      popupManager.addPopup(popupAbout)

      const signInPopups = popupManager.getPopupsOfType(PopupType.SignIn)
      expect(signInPopups).toBeArrayOfSize(0)
    })
  })

  describe('areTherePopupsOfType', () => {
    it('returns true if popup of type exists', () => {
      const popupAbout: Popup = { type: PopupType.About }
      popupManager.addPopup(popupAbout)

      const areThereAboutPopups = popupManager.areTherePopupsOfType(
        PopupType.About
      )
      expect(areThereAboutPopups).toBeTrue()
    })

    it('returns false if there are no popups of that type', () => {
      const popupAbout: Popup = { type: PopupType.About }
      popupManager.addPopup(popupAbout)

      const areThereSignInPopups = popupManager.areTherePopupsOfType(
        PopupType.SignIn
      )
      expect(areThereSignInPopups).toBeFalse()
    })
  })

  describe('addPopup', () => {
    it('adds a popup to the stack', () => {
      const popup: Popup = { type: PopupType.About }
      popupManager.addPopup(popup)

      const popupsOfType = popupManager.getPopupsOfType(PopupType.About)
      const currentPopup = popupManager.currentPopup
      expect(popupsOfType).toBeArrayOfSize(1)
      expect(currentPopup).not.toBeNull()
      expect(currentPopup?.type).toBe(PopupType.About)
      expect(currentPopup?.id).toBe(0)
    })

    it('does not add multiple popups of the same kind to the stack', () => {
      const popup: Popup = { type: PopupType.About }
      popupManager.addPopup(popup)
      popupManager.addPopup(popup)

      const popupsOfType = popupManager.getPopupsOfType(PopupType.About)
      expect(popupsOfType).toBeArrayOfSize(1)
    })

    it('adds multiple popups of different types', () => {
      const popupAbout: Popup = { type: PopupType.About }
      const popupSignIn: Popup = { type: PopupType.SignIn }
      popupManager.addPopup(popupAbout)
      popupManager.addPopup(popupSignIn)

      const aboutPopups = popupManager.getPopupsOfType(PopupType.About)
      const signInPoups = popupManager.getPopupsOfType(PopupType.SignIn)
      expect(aboutPopups).toBeArrayOfSize(1)
      expect(signInPoups).toBeArrayOfSize(1)

      expect(aboutPopups.at(0)?.type).toBe(PopupType.About)
      expect(signInPoups.at(0)?.type).toBe(PopupType.SignIn)
    })

    it('trims oldest popup when limit is reached', () => {
      popupManager = new PopupManager(2)
      const popupAbout: Popup = { type: PopupType.About }
      const popupSignIn: Popup = { type: PopupType.SignIn }
      const popupTermsAndConditions: Popup = {
        type: PopupType.TermsAndConditions,
      }
      popupManager.addPopup(popupAbout)
      popupManager.addPopup(popupSignIn)
      popupManager.addPopup(popupTermsAndConditions)

      const aboutPopups = popupManager.getPopupsOfType(PopupType.About)
      const signInPoups = popupManager.getPopupsOfType(PopupType.SignIn)
      const termsAndConditionsPoups = popupManager.getPopupsOfType(
        PopupType.TermsAndConditions
      )
      expect(aboutPopups).toBeArrayOfSize(0)
      expect(signInPoups).toBeArrayOfSize(1)
      expect(termsAndConditionsPoups).toBeArrayOfSize(1)

      expect(signInPoups.at(0)?.type).toBe(PopupType.SignIn)
      expect(termsAndConditionsPoups.at(0)?.type).toBe(
        PopupType.TermsAndConditions
      )
    })
  })

  describe('addErrorPopup', () => {
    it('adds a popup of type error to the stack', () => {
      popupManager.addErrorPopup(new Error('an error'))

      const popupsOfType = popupManager.getPopupsOfType(PopupType.Error)
      const currentPopup = popupManager.currentPopup
      expect(popupsOfType).toBeArrayOfSize(1)
      expect(currentPopup).not.toBeNull()
      expect(currentPopup?.type).toBe(PopupType.Error)
      expect(currentPopup?.id).toBe(0)
    })

    it('adds multiple popups of type error to the stack', () => {
      popupManager.addErrorPopup(new Error('an error'))
      popupManager.addErrorPopup(new Error('an error'))

      const popupsOfType = popupManager.getPopupsOfType(PopupType.Error)
      expect(popupsOfType).toBeArrayOfSize(2)
    })

    it('trims oldest popup when limit is reached', () => {
      const limit = 2
      popupManager = new PopupManager(limit)
      popupManager.addErrorPopup(new Error('an error'))
      popupManager.addErrorPopup(new Error('an error'))
      popupManager.addErrorPopup(new Error('an error'))
      popupManager.addErrorPopup(new Error('an error'))

      const errorPopups = popupManager.getPopupsOfType(PopupType.Error)
      expect(errorPopups).toBeArrayOfSize(limit)
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
      expect(result).toBeArrayOfSize(1)
      const resultingPopup = result.at(0)
      // Would fail first expect if not
      if (resultingPopup === undefined) {
        return
      }

      expect(resultingPopup.type).toBe(PopupType.CreateTutorialRepository)
      if (resultingPopup.type !== PopupType.CreateTutorialRepository) {
        return
      }

      expect(resultingPopup.progress).toBeDefined()
      expect(resultingPopup.progress?.kind).toBe('generic')
      expect(resultingPopup.progress?.value).toBe(5)
    })
  })

  describe('removePopup', () => {
    it('deletes popup when give a popup with an id', () => {
      const popupAbout: Popup = popupManager.addPopup({ type: PopupType.About })
      popupManager.addPopup({
        type: PopupType.SignIn,
      })

      popupManager.removePopup(popupAbout)

      const aboutPopups = popupManager.getPopupsOfType(PopupType.About)
      expect(aboutPopups).toBeArrayOfSize(0)

      const signInPopups = popupManager.getPopupsOfType(PopupType.SignIn)
      expect(signInPopups).toBeArrayOfSize(1)
    })

    it('does not remove popups by type', () => {
      popupManager.addPopup({ type: PopupType.About })
      popupManager.addPopup({
        type: PopupType.SignIn,
      })

      popupManager.removePopup({ type: PopupType.About })

      const aboutPopups = popupManager.getPopupsOfType(PopupType.About)
      expect(aboutPopups).toBeArrayOfSize(1)

      const signInPopups = popupManager.getPopupsOfType(PopupType.SignIn)
      expect(signInPopups).toBeArrayOfSize(1)
    })
  })

  describe('removePopupByType', () => {
    it('removes the popups of a given type', () => {
      popupManager.addPopup({ type: PopupType.About })
      popupManager.addPopup({
        type: PopupType.SignIn,
      })

      popupManager.removePopupByType(PopupType.About)

      const aboutPopups = popupManager.getPopupsOfType(PopupType.About)
      expect(aboutPopups).toBeArrayOfSize(0)

      const signInPopups = popupManager.getPopupsOfType(PopupType.SignIn)
      expect(signInPopups).toBeArrayOfSize(1)
    })
  })

  describe('removePopupById', () => {
    it('removes the popup by its id', () => {
      const popupAbout: Popup = popupManager.addPopup({ type: PopupType.About })
      popupManager.addPopup({
        type: PopupType.SignIn,
      })

      expect(popupAbout.id).toBeDefined()
      if (popupAbout.id === undefined) {
        return
      }

      popupManager.removePopupById(popupAbout.id)

      const aboutPopups = popupManager.getPopupsOfType(PopupType.About)
      expect(aboutPopups).toBeArrayOfSize(0)

      const signInPopups = popupManager.getPopupsOfType(PopupType.SignIn)
      expect(signInPopups).toBeArrayOfSize(1)
    })
  })
})
