import * as React from 'react'
import {
  ApplicationTheme,
  supportsSystemThemeChanges,
  getCurrentlyAppliedTheme,
  ICustomTheme,
} from '../lib/application-theme'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import { CustomThemeSelector } from './custom-theme-selector'
import { enableHighContrastTheme } from '../../lib/feature-flag'
import { RadioGroup } from '../lib/radio-group'
import { encodePathAsUrl } from '../../lib/path'

interface IAppearanceProps {
  readonly selectedTheme: ApplicationTheme
  readonly customTheme?: ICustomTheme
  readonly onSelectedThemeChanged: (theme: ApplicationTheme) => void
  readonly onCustomThemeChanged: (theme: ICustomTheme) => void
}

interface IAppearanceState {
  readonly selectedTheme: ApplicationTheme | null
}

export class Appearance extends React.Component<
  IAppearanceProps,
  IAppearanceState
> {
  public constructor(props: IAppearanceProps) {
    super(props)

    const usePropTheme =
      props.selectedTheme !== ApplicationTheme.System ||
      supportsSystemThemeChanges()

    this.state = { selectedTheme: usePropTheme ? props.selectedTheme : null }

    if (!usePropTheme) {
      this.initializeSelectedTheme()
    }
  }

  public async componentDidUpdate(prevProps: IAppearanceProps) {
    if (prevProps.selectedTheme === this.props.selectedTheme) {
      return
    }

    const usePropTheme =
      this.props.selectedTheme !== ApplicationTheme.System ||
      supportsSystemThemeChanges()

    const selectedTheme = usePropTheme
      ? this.props.selectedTheme
      : await getCurrentlyAppliedTheme()

    this.setState({ selectedTheme })
  }

  private initializeSelectedTheme = async () => {
    const selectedTheme = await getCurrentlyAppliedTheme()
    this.setState({ selectedTheme })
  }

  private onSelectedThemeChanged = (theme: ApplicationTheme) => {
    this.props.onSelectedThemeChanged(theme)
  }

  private onCustomThemeChanged = (theme: ICustomTheme) => {
    this.props.onCustomThemeChanged(theme)
  }

  public render() {
    const { selectedTheme } = this.state

    if (selectedTheme == null) {
      return (
        <DialogContent>
          <Row>Loading system theme</Row>
        </DialogContent>
      )
    }

    const darkThemeImage = encodePathAsUrl(__dirname, 'static/ghd_dark.svg')
    const lightThemeImage = encodePathAsUrl(__dirname, 'static/ghd_light.svg')

    return (
      <DialogContent>
        <h2 id="theme-heading">Theme</h2>
        <RadioGroup<ApplicationTheme>
          ariaLabelledBy="theme-heading"
          className="theme-selector"
          selectedKey={selectedTheme}
          radioButtonKeys={[
            ApplicationTheme.Light,
            ApplicationTheme.Dark,
            ...(supportsSystemThemeChanges() ? [ApplicationTheme.System] : []),
            ...(enableHighContrastTheme()
              ? [ApplicationTheme.HighContrast]
              : []),
          ]}
          onSelectionChanged={this.onSelectedThemeChanged}
        >
          <span>
            <img src={lightThemeImage} alt="" />
            <span className="theme-value-label">Light</span>
          </span>
          <span>
            <img src={darkThemeImage} alt="" />
            <span className="theme-value-label">Dark</span>
          </span>
          {supportsSystemThemeChanges() && (
            <span>
              <span className="system-theme-swatch">
                <img src={lightThemeImage} alt="" />
                <img src={lightThemeImage} alt="" />
                <img src={darkThemeImage} alt="" />
              </span>
              <span className="theme-value-label">System</span>
            </span>
          )}
          {enableHighContrastTheme() && (
            <span>
              <img src={darkThemeImage} alt="" />
              <span className="theme-value-label">High Contrast</span>
            </span>
          )}
        </RadioGroup>

        <Row>
          <CustomThemeSelector
            onCustomThemeChanged={this.onCustomThemeChanged}
            selectedTheme={selectedTheme}
            customTheme={this.props.customTheme}
          />
        </Row>
      </DialogContent>
    )
  }
}
