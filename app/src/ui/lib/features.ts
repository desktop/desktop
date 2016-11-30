function getFeatureOverride(featureName: string, defaultValue: boolean): boolean {
  const override = localStorage.getItem(`features/${featureName}`)

  if (override) {
    if (override === '1' || override === 'true') {
      return true
    } else if (override === '0' || override === 'false') {
      return false
    }
  }

  return defaultValue
}

/**
 * Gets a value indicating whether the renderer should
 * be responsible for rendering an application menu.
 *
 * Can be overriden with the localStorage variable
 *
 *  features/render-application-menu
 *
 * Default: false on macOS, true on other platforms.
 */
export function renderApplicationMenu(): boolean {
  return getFeatureOverride('render-application-menu', __DARWIN__ ? false : true)
}
