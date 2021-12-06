import { ApplicationTheme, ICustomTheme } from './application-theme'
import { lightenDarkenHexColor } from './color-manipulation'

/**
 * An array to hold default custom themes.
 *
 * This currently only has high-contrast, but if we expanded on customizable
 * themes in the future. We could just add to this array for other defaults.
 */
export const CustomThemeDefaults = {
  [ApplicationTheme.HighContrast]: {
    background: '#090c11',
    border: '#7a828e',
    text: '#f0f3f6',
    activeItem: '#9ea7b3',
    activeText: '#090c11',
  },
}

/**
 * This takes a custom theme object and builds a custom theme style sheet base on the class
 * .custom-theme.
 *
 * Currently, our only custom theme is a high-contrast theme, thus there are
 * styles that are specifically added for this purpose such as adding borders
 * or backgrounds to things that didn't have borders in our non-high-contrast
 * themes.
 *
 * @param customTheme - object with custom theme object
 */
export function buildCustomThemeStyles(customTheme: ICustomTheme): string {
  const { background, text, activeItem, activeText, border } = customTheme
  const secondaryActiveColor = lightenDarkenHexColor(activeItem, 20)
  const secondaryBackgroundColor = lightenDarkenHexColor(background, 20)

  return `body.theme-high-contrast {
    --hc-background-color: ${background};
    --hc-secondary-background-color: ${secondaryBackgroundColor};
    --hc-border-color: ${border};
    --hc-text-color: ${text};
    --hc-active-item-color: ${activeItem};
    --hc-secondary-active-item-color: ${secondaryActiveColor};
    --hc-active-text-color: ${activeText};
  }`
}
