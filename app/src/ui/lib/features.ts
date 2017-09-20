function getFeatureOverride(
  featureName: string,
  defaultValue: boolean
): boolean {
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

function featureFlag(
  featureName: string,
  defaultValue: boolean,
  memoize: boolean
): () => boolean {
  const getter = () => getFeatureOverride(featureName, defaultValue)

  if (memoize) {
    const value = getter()
    return () => value
  } else {
    return getter
  }
}

/**
 * Gets a value indicating whether the renderer should be responsible for
 * rendering an application menu.
 *
 * Can be overriden with the localStorage variable
 *
 *  features/should-render-application-menu
 *
 * Default: false on macOS, true on other platforms.
 */
export const shouldRenderApplicationMenu = featureFlag(
  'should-render-application-menu',
  __DARWIN__ ? false : true,
  true
)
