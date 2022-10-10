import * as React from 'react'
import {
  ApplicationTheme,
  getThemeName,
  getCurrentlyAppliedTheme,
  ICustomTheme,
} from './lib/application-theme'
import { isHexColorLight } from './lib/color-manipulation'
import { buildCustomThemeStyles } from './lib/custom-theme'

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

  private async ensureTheme() {
    const { customTheme, useCustomTheme } = this.props
    if (customTheme !== undefined && useCustomTheme) {
      this.clearThemes()
      this.setCustomTheme(customTheme)
      return
    }

    let themeToDisplay = this.props.theme

    if (this.props.theme === ApplicationTheme.System) {
      themeToDisplay = await getCurrentlyAppliedTheme()
    }

    const newThemeClassName = `theme-${getThemeName(themeToDisplay)}`
    const body = document.body

    if (
      !body.classList.contains(newThemeClassName) ||
      (body.classList.contains('theme-high-contrast') &&
        !this.props.useCustomTheme)
    ) {
      this.clearThemes()
      body.classList.add(newThemeClassName)
      this.updateColorScheme()
    }
  }

  private updateColorScheme = () => {
    const isDarkTheme = document.body.classList.contains('theme-dark')
    const rootStyle = document.documentElement.style

    rootStyle.colorScheme = isDarkTheme ? 'dark' : 'light'
  }

  /**
   * This takes a custom theme object and applies it over top either our dark or
   * light theme dynamically creating a new variables style sheet.
   *
   * It uses the background color of the custom theme to determine if the custom
   * theme should be based on the light or dark theme. This is most important
   * for the diff syntax highlighting.
   *
   * @param customTheme
   */
  private setCustomTheme(customTheme: ICustomTheme) {
    const { background } = customTheme
    const body = document.body

    if (!body.classList.contains('theme-high-contrast')) {
      // Currently our only custom theme is the high-contrast theme
      // If we were to expand upon custom theming we would not
      // want this so specific.
      body.classList.add('theme-high-contrast')
      // This is important so that code diff syntax colors are legible if the
      // user customizes to a light vs dark background. Tho, the code diff does
      // still use the customizable text color for some of the syntax text so
      // user can still make things illegible by choosing poorly.
      const themeBase = isHexColorLight(background)
        ? 'theme-light'
        : 'theme-dark'
      body.classList.add(themeBase)
    }

    const customThemeStyles = buildCustomThemeStyles(customTheme)

    const styles = document.createElement('style')
    styles.setAttribute('type', 'text/css')
    styles.appendChild(document.createTextNode(customThemeStyles))

    body.appendChild(styles)
    this.updateColorScheme()
  }

  private clearThemes() {
    const body = document.body

    // body.classList is a DOMTokenList and it does not iterate all the way
    // through with the for loop. (why it doesn't.. ¯\_(ツ)_/¯ - Possibly
    // because we are modifying it as we loop) Hence the extra step of
    // converting it to a string array.
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
