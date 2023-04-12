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

    return (
      <DialogContent>
        <h2 id="theme-heading"> Theme Selection</h2>
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
            <img
              src="https://github.githubassets.com/images/modules/settings/color_modes/light_preview.svg"
              alt=""
              width="64"
              height="64"
            />
            <span>Light</span>
          </span>
          <span>
            <img
              src="https://github.githubassets.com/images/modules/settings/color_modes/dark_preview.svg"
              alt=""
              width="64"
              height="64"
            />
            <span>Dark</span>
          </span>
          {supportsSystemThemeChanges() && (
            <span>
              <img
                src="https://github.githubassets.com/images/modules/settings/color_modes/light_preview.svg"
                alt=""
                width="64"
                height="64"
              />
              <span>System</span>
            </span>
          )}
          {enableHighContrastTheme() && (
            <span>
              <img
                src="https://github.githubassets.com/images/modules/settings/color_modes/dark_high_contrast_preview.svg"
                alt=""
                width="64"
                height="64"
              />
              <span>System</span>
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
