import { setupOnboardingTutorialRepo } from '../helpers/repositories'

describe('OnboardingTutorial', () => {
  describe('isEditorInstalled()', () => {
    it('returns true if step has been skipped', async () => {
      const repo = await setupOnboardingTutorialRepo()
    })

    it('returns true if resolved editor exists', () => {})
  })
})
