import * as React from 'react'
import { ApplicationTheme, getThemeName } from './lib/application-theme'

interface IAppThemeProps {
  readonly theme: ApplicationTheme
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
    const newThemeClassName = `theme-${getThemeName(this.props.theme)}`
    const body = document.body

    if (body.classList.contains(newThemeClassName)) {
      return
    }

    this.clearThemes()

    body.classList.add(newThemeClassName)
  }

  private clearThemes() {
    const body = document.body

    for (const className of body.classList) {
      if (className.startsWith('theme-')) {
        body.classList.remove(className)
      }
    }
  }

  public render() {
    return null
  }
}
