import * as React from 'react'
import {
  ApplicationTheme,
  getThemeName,
  getCurrentlyAppliedTheme,
  ICustomTheme,
} from './lib/application-theme'

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

    this.setCustomTheme()
  }

  private setCustomTheme() {
    const { customTheme, useCustomTheme } = this.props
    if (customTheme === undefined || !useCustomTheme) {
      return
    }

    const body = document.body
    if (!body.classList.contains('theme-custom')) {
      body.classList.add('theme-custom')
    }

    const styles = document.createElement('style')
    styles.setAttribute('type', 'text/css')

    const { background, text, activeItem, activeText, border } = customTheme
    const secondaryActiveColor = this.lightenDarkenColor(activeItem, 20)
    const secondaryBackgroundColor = this.lightenDarkenColor(background, 20)

    const highContrastSpecific = `
        --box-selected-active-border: 2px solid ${border};
        --list-item-hover-border: 2px solid ${border};

        --secondary-button-hover-border-width: 2px;

        --tab-bar-box-shadow: inset -3px -2px 0px var(--tab-bar-active-color), inset 3px 2px 0px var(--tab-bar-active-color);

        --diff-add-border: 1px solid green;
        --diff-delete-border: 1px solid crimson;
        --tab-bar-hover-border: 2px solid ${border} !important;
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

  private lightenDarkenColor(col: string, amt: number) {
    let usePound = false

    if (col[0] == '#') {
      col = col.slice(1)
      usePound = true
    }

    const num = parseInt(col, 16)

    let r = (num >> 16) + amt

    if (r > 255) {
      r = 255
    } else if (r < 0) {
      r = 0
    }

    let b = ((num >> 8) & 0x00ff) + amt

    if (b > 255) {
      b = 255
    } else if (b < 0) {
      b = 0
    }

    let g = (num & 0x0000ff) + amt

    if (g > 255) {
      g = 255
    } else if (g < 0) {
      g = 0
    }

    return (usePound ? '#' : '') + (g | (b << 8) | (r << 16)).toString(16)
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
