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

    const {
      background,
      text,
      hoverItem,
      hoverText,
      activeItem,
      activeText,
      border,
    } = customTheme

    styles.appendChild(
      document.createTextNode(
        `body.theme-custom {
            --background-color: ${background};
            --box-background-color: ${background};
            --box-alt-background-color: ${background};
            --box-alt-text-color: ${activeText};

            --box-border-color: ${border};
            --diff-border-color: ${border};

            --box-selected-background-color: ${hoverItem};
            --box-selected-text-color: ${hoverText};
            
            --box-selected-active-background-color: ${activeItem};
            --box-selected-active-text-color: ${activeText};
            --box-selected-active-border: 2px solid ${border};

            --button-background: ${activeItem};
            --button-text-color: ${activeText};
            --secondary-button-background: ${background};
            --secondary-button-text-color: ${text};

            --text-color: ${text};
            --text-secondary-color: ${text};
            --toolbar-background-color: ${background};
            --toolbar-button-secondary-color: ${text}

            --list-item-hover-background-color: ${hoverItem};
            --list-item-hover-text-color: ${hoverText};
            --list-item-hover-border: 2px solid ${border};
            
            --box-placeholder-color: ${text};
            --tab-bar-active-color: ${activeItem};
            --tab-bar-box-shadow: inset -2px -2px 0px var(--tab-bar-active-color), inset 2px 2px 0px var(--tab-bar-active-color);

            --diff-add-border: 1px solid green;
            --diff-delete-border: 1px solid crimson;
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
