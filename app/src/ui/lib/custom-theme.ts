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

  const highContrastSpecific = `
      --box-selected-active-border: 2px solid ${border};
      --list-item-hover-border: 2px solid ${border};

      --secondary-button-hover-border-width: 2px;

      --tab-bar-box-shadow: none;

      --diff-add-border: 1px solid green;
      --diff-delete-border: 1px solid crimson;
      --tab-bar-hover-border: 2px solid ${border} !important;
      --tab-bar-item-border: 2px solid ${background};
      --foldout-border: 1px solid ${border};
      --horizontal-bar-active-color: ${activeItem};
      --horizontal-bar-active-text-color: ${activeText};
  `

  return `body.theme-custom {
    --background-color: ${background};
    --box-background-color: ${background};
    --box-alt-background-color: ${background};
    --box-alt-text-color: ${activeText};

    --diff-hunk-gutter-background-color: ${background};
    --diff-text-color: ${text};
    --diff-line-number-color: ${text};
    --diff-gutter-background-color: ${background};
    --diff-hunk-background-color: ${background};
    --diff-empty-row-background-color: ${secondaryBackgroundColor};

    --box-border-color: ${border};
    --diff-border-color: ${border};

    --box-selected-background-color: ${secondaryActiveColor};
    --box-selected-text-color: ${activeText};

    --box-selected-active-background-color: ${activeItem};
    --box-selected-active-text-color: ${activeText};

    --button-background: ${activeItem};
    --button-text-color: ${activeText};
    --secondary-button-background: ${background};
    --secondary-button-text-color: ${text};
    --button-hover-background: ${secondaryActiveColor};
    --secondary-button-hover-background: ${secondaryBackgroundColor};
    --app-menu-button-hover-background-color: ${secondaryBackgroundColor};
    --toolbar-button-focus-background-color: ${secondaryBackgroundColor};
    --toolbar-button-hover-background-color: ${secondaryBackgroundColor};
    --toolbar-button-active-border-color: ${border};
    --tab-bar-hover-background-color: ${secondaryBackgroundColor};

    --text-color: ${text};
    --text-secondary-color: ${text};
    --toolbar-background-color: ${background};
    --toolbar-button-secondary-color: ${text};

    --list-item-hover-background-color: ${secondaryActiveColor};
    --list-item-hover-text-color: ${activeText};

    --box-placeholder-color: ${text};
    --tab-bar-active-color: ${activeItem};

    ${highContrastSpecific}
  }`
}
