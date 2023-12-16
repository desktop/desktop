import * as React from 'react'
import {
  ApplicationTheme,
  supportsSystemThemeChanges,
  getCurrentlyAppliedTheme,
} from '../lib/application-theme'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import { RadioGroup } from '../lib/radio-group'
import { encodePathAsUrl } from '../../lib/path'
import { TextBox } from '../lib/text-box'
import { MaxRecentRepositoriesLength } from '../../lib/stores'

interface IAppearanceProps {
  readonly selectedTheme: ApplicationTheme
  readonly recentRepositoriesCount: number
  readonly onSelectedThemeChanged: (theme: ApplicationTheme) => void
  readonly setRecentRepositoriesCount: (count: number) => void
}

interface IAppearanceState {
  readonly selectedTheme: ApplicationTheme | null
  readonly recentRepositoriesCount: string
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

    this.state = {
      selectedTheme: usePropTheme ? props.selectedTheme : null,
      recentRepositoriesCount: props.recentRepositoriesCount.toString(),
    }

    if (!usePropTheme) {
      this.initializeSelectedTheme()
    }
  }

  public async componentDidUpdate(prevProps: IAppearanceProps) {
    if (
      prevProps.selectedTheme === this.props.selectedTheme &&
      prevProps.recentRepositoriesCount === this.props.recentRepositoriesCount
    ) {
      return
    }

    const usePropTheme =
      this.props.selectedTheme !== ApplicationTheme.System ||
      supportsSystemThemeChanges()

    const selectedTheme = usePropTheme
      ? this.props.selectedTheme
      : await getCurrentlyAppliedTheme()

    this.setState({
      selectedTheme,
      recentRepositoriesCount:
        this.state.recentRepositoriesCount === '' &&
        this.props.recentRepositoriesCount === 0
          ? ''
          : this.props.recentRepositoriesCount.toString(),
    })
  }

  private initializeSelectedTheme = async () => {
    const selectedTheme = await getCurrentlyAppliedTheme()
    this.setState({ selectedTheme })
  }

  private onSelectedThemeChanged = (theme: ApplicationTheme) => {
    this.props.onSelectedThemeChanged(theme)
  }

  private onRecentRepositoriesCountChanged = (count: string) => {
    const countNumber = parseInt(count, 10)
    if (isNaN(countNumber)) {
      this.setState({ recentRepositoriesCount: count })
    }
    this.props.setRecentRepositoriesCount(countNumber || 0)
  }

  public renderThemeSwatch = (theme: ApplicationTheme) => {
    const darkThemeImage = encodePathAsUrl(__dirname, 'static/ghd_dark.svg')
    const lightThemeImage = encodePathAsUrl(__dirname, 'static/ghd_light.svg')

    switch (theme) {
      case ApplicationTheme.Light:
        return (
          <span>
            <img src={lightThemeImage} alt="" />
            <span className="theme-value-label">Light</span>
          </span>
        )
      case ApplicationTheme.Dark:
        return (
          <span>
            <img src={darkThemeImage} alt="" />
            <span className="theme-value-label">Dark</span>
          </span>
        )
      case ApplicationTheme.System:
        /** Why three images? The system theme swatch uses the first image
         * positioned relatively to get the label container size and uses the
         * second and third positioned absolutely over first and third one
         * clipped in half to render a split dark and light theme swatch. */
        return (
          <span>
            <span className="system-theme-swatch">
              <img src={lightThemeImage} alt="" />
              <img src={lightThemeImage} alt="" />
              <img src={darkThemeImage} alt="" />
            </span>
            <span className="theme-value-label">System</span>
          </span>
        )
    }
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

    const themes = [
      ApplicationTheme.Light,
      ApplicationTheme.Dark,
      ...(supportsSystemThemeChanges() ? [ApplicationTheme.System] : []),
    ]

    return (
      <DialogContent>
        <h2 id="theme-heading">Theme</h2>
        <RadioGroup<ApplicationTheme>
          ariaLabelledBy="theme-heading"
          className="theme-selector"
          selectedKey={selectedTheme}
          radioButtonKeys={themes}
          onSelectionChanged={this.onSelectedThemeChanged}
          renderRadioButtonLabelContents={this.renderThemeSwatch}
        />
        <h2 className="recent-repository-heading">Options</h2>
        <div className="recent-repository-count">
          <TextBox
            type="number"
            label="Recent Repository Count"
            value={this.state.recentRepositoriesCount}
            onValueChanged={this.onRecentRepositoriesCountChanged}
            min={0}
            max={MaxRecentRepositoriesLength}
          />
        </div>
      </DialogContent>
    )
  }
}
