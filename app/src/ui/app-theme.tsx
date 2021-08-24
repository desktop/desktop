import * as React from 'react'
import {
  ApplicationTheme,
  getThemeName,
  getCurrentlyAppliedTheme,
  ICustomTheme,
} from './lib/application-theme'
import {
  isHexColorLight,
  lightenDarkenHexColor,
} from './lib/color-manipulation'

interface IAppThemeProps {
  readonly theme: ApplicationTheme
  readonly useCustomTheme: boolean
  readonly customTheme?: ICustomTheme
}

/**
 * A pseudo-component responsible for adding the applicable CSS
 * class names to the body tag in order to apply the currently
 * selected theme.
 *
 * This component is a PureComponent, meaning that it'll only
 * render when its props changes (shallow comparison).
 *
 * This component does not render anything into the DOM, it's
 * purely (a)busing the component lifecycle to manipulate the
 * body class list.
 */
export class AppTheme extends React.PureComponent<IAppThemeProps> {
  public componentDidMount() {
    this.ensureTheme()
  }

  public componentDidUpdate() {
    this.ensureTheme()
  }

  public componentWillUnmount() {
    this.clearThemes()
  }

  private ensureTheme() {
    const { customTheme, useCustomTheme } = this.props
    if (customTheme !== undefined && useCustomTheme) {
      this.clearThemes()
      this.setCustomTheme(customTheme)
      return
    }

    let themeToDisplay = this.props.theme

    if (this.props.theme === ApplicationTheme.System) {
      themeToDisplay = getCurrentlyAppliedTheme()
    }

    const newThemeClassName = `theme-${getThemeName(themeToDisplay)}`
    const body = document.body

    if (
      !body.classList.contains(newThemeClassName) ||
      (body.classList.contains('theme-custom') && !this.props.useCustomTheme)
    ) {
      this.clearThemes()
      body.classList.add(newThemeClassName)
    }
  }

  /**
   * This takes a custom theme object and applies it over top either our dark or
   * light theme dynamically creating a new variables style sheet.
   *
   * It uses the background color of the custom theme to determine if the custom
   * theme should be based on the light or dark theme. This is most important
   * for the diff syntax highlighting.
   *
   * Currently, our only custom theme is a high-contrast theme, thus there are
   * styles that are specifically added for this purpose such as adding borders
   * or backgrounds to things that didn't have borders in our non-high-contrast
   * themes.
   *
   * @param customTheme
   */
  private setCustomTheme(customTheme: ICustomTheme) {
    const { background, text, activeItem, activeText, border } = customTheme
    const body = document.body

    if (!body.classList.contains('theme-custom')) {
      body.classList.add('theme-custom')
      // This is important so that code diff syntax colors are legible if the
      // user customizes to a light vs dark background. Tho, the code diff does
      // still use the customizable text color for some of the syntax text so
      // user can still make things illegible by choosing poorly.
      const themeBase = isHexColorLight(background)
        ? 'theme-light'
        : 'theme-dark'
      body.classList.add(themeBase)
    }

    const styles = document.createElement('style')
    styles.setAttribute('type', 'text/css')

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

    styles.appendChild(
      document.createTextNode(
        `body.theme-custom {
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
      )
    )
    body.appendChild(styles)
  }

  private clearThemes() {
    const body = document.body

    const classList = [...body.classList]
    for (const className of classList) {
      if (className.startsWith('theme-')) {
        body.classList.remove(className)
      }
    }
  }

  public render() {
    return null
  }
}
