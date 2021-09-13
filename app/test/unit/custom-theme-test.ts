import { ApplicationTheme } from '../../src/ui/lib/application-theme'
import {
  buildCustomThemeStyles,
  CustomThemeDefaults,
} from '../../src/ui/lib/custom-theme'

describe('CustomTheme', () => {
  describe('buildCustomThemeStyles', () => {
    it('sets the first line to body.theme-high-contrast {', () => {
      const customTheme = CustomThemeDefaults[ApplicationTheme.HighContrast]
      const customThemeStyles = buildCustomThemeStyles(customTheme)
      expect(customThemeStyles.split('\n')[0]).toBe(
        'body.theme-high-contrast {'
      )
    })

    it('sets the last line to }', () => {
      const customTheme = CustomThemeDefaults[ApplicationTheme.HighContrast]
      const customThemeStyles = buildCustomThemeStyles(customTheme)
      expect(customThemeStyles.substr(-1, 1)).toBe('}')
    })

    it('prefaces all variable lines with --', () => {
      const customTheme = CustomThemeDefaults[ApplicationTheme.HighContrast]
      const customThemeStyles = buildCustomThemeStyles(customTheme)
      const styleLines = customThemeStyles.split('\n')

      // skip first and last line
      for (let i = 1; i < styleLines.length - 1; i++) {
        const trimmedLine = styleLines[i].trim()
        if (trimmedLine === '') {
          continue
        }
        const firstTwoChar = trimmedLine.substr(0, 2)
        expect(firstTwoChar).toBe('--')
      }
    })

    it('ends all variable lines with ;', () => {
      const customTheme = CustomThemeDefaults[ApplicationTheme.HighContrast]
      const customThemeStyles = buildCustomThemeStyles(customTheme)
      const styleLines = customThemeStyles.split('\n')

      // skip first, last line, and empty lines
      for (let i = 1; i < styleLines.length - 1; i++) {
        const trimmedLine = styleLines[i].trim()
        if (trimmedLine === '') {
          continue
        }
        const firstTwoChar = trimmedLine.substr(-1, 1)
        expect(firstTwoChar).toBe(';')
      }
    })
  })
})
