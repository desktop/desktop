import * as React from 'react'
import { Ref } from '../ui/lib/ref'
import { getStringArray, setStringArray } from './local-storage'
import { assertNever } from './fatal-error'

const ExperimentalFeaturesStorageKey = 'experimental-features'

enum FeatureAvailability {
  Off = 'off',
  Dev = 'dev',
  Beta = 'beta',
  Production = 'production',
}

export interface IExperimentalFeatureDefinition {
  readonly id: string
  readonly title: string
  readonly description: string | JSX.Element
  readonly availability: FeatureAvailability
  readonly shouldBeDisplayed?: () => boolean
}

export interface IExperimentalFeature {
  readonly id: string
  readonly title: string
  readonly description: string | JSX.Element
  readonly enabled: boolean
}

const ExperimentalFeatures = [
  {
    id: 'progressBarOnIcon',
    title: 'Show Progress Bar on App Icon',
    description: (
      <>
        Displays a progress bar on the operating system icon when the app is
        performing any fetch or push operation.
      </>
    ),
    availability: FeatureAvailability.Beta,
  },
  {
    id: 'recurseSubmodulesFlag',
    title: 'Better treatment of git submodules',
    description: (
      <>
        Uses <Ref>--recurse-submodules</Ref> git parameter when performing
        certain operations to improve support for git submodules.
      </>
    ),
    availability: FeatureAvailability.Beta,
  },
  {
    id: 'readmeOverwriteWarning',
    title: 'Show warnings when overriding a Readme file',
    description: (
      <>
        Displays a warning when trying to create a repository with a from an
        existing folder with a <Ref>Readme</Ref> file if the folder already
        contains such file.
      </>
    ),
    availability: FeatureAvailability.Beta,
  },
  {
    id: 'wdslDetection',
    title: 'Windows WDSL Support',
    description: (
      <>Detects the WDSL terminal if WDSL is installed in the system</>
    ),
    availability: FeatureAvailability.Beta,
    shouldBeDisplayed: () => __WIN32__,
  },
  {
    id: 'forkSettings',
    title: 'Worfklow Settings for fork repositories',
    description: (
      <>
        Adds a new tab on the "Repository Settings" dialog for fork repositories
        that allows to configure whether to use the fork or its parent as the
        main repository.
      </>
    ),
    availability: FeatureAvailability.Beta,
  },
  {
    id: 'commitGraph',
    title: 'Enable Commit Graph',
    description: (
      <>
        Adds a new button to show/hide a commit graph next to the commits on the
        history tab.
      </>
    ),
    availability: FeatureAvailability.Off,
  },
]

export function getExperimentalFeatures(): ReadonlyArray<IExperimentalFeature> {
  const currentlyEnabledFeatures = new Set(
    getStringArray(ExperimentalFeaturesStorageKey)
  )

  return ExperimentalFeatures.filter(feature => {
    if (feature.shouldBeDisplayed && !feature.shouldBeDisplayed()) {
      return false
    }

    // In development mode we show all experimental features
    // so it's possible to disable/enable any feature.
    if (enableDevelopmentFeatures()) {
      return true
    }

    switch (feature.availability) {
      case FeatureAvailability.Off:
        return true
      case FeatureAvailability.Dev:
        return !enableDevelopmentFeatures()
      case FeatureAvailability.Beta:
        return !enableBetaFeatures()
      case FeatureAvailability.Production:
        return false
    }
  }).map(feature => {
    return {
      id: feature.id,
      title: feature.title,
      description: feature.description,
      enabled: currentlyEnabledFeatures.has(feature.id),
    }
  })
}

export function enableExperimentalFeature(id: string) {
  const features = new Set(getStringArray(ExperimentalFeaturesStorageKey))
  features.add(id)

  setStringArray(ExperimentalFeaturesStorageKey, [...features])
}

export function disableExperimentalFeature(id: string) {
  const features = new Set(getStringArray(ExperimentalFeaturesStorageKey))
  features.delete(id)

  setStringArray(ExperimentalFeaturesStorageKey, [...features])
}

export function getExperimentalFeatureValue(id: string): boolean {
  const feature = ExperimentalFeatures.find(feature => feature.id === id)

  if (feature === undefined) {
    return false
  }

  const overrideValue = getStringArray(ExperimentalFeaturesStorageKey).includes(
    id
  )

  switch (feature.availability) {
    case FeatureAvailability.Off:
      return overrideValue
    case FeatureAvailability.Dev:
      return overrideValue || enableDevelopmentFeatures()
    case FeatureAvailability.Beta:
      return overrideValue || enableBetaFeatures()
    case FeatureAvailability.Production:
      return true
    default:
      return assertNever(feature.availability, 'invalid availability')
  }
}

const Disable = false

/**
 * Enables the application to opt-in for preview features based on runtime
 * checks. This is backed by the GITHUB_DESKTOP_PREVIEW_FEATURES environment
 * variable, which is checked for non-development environments.
 */
function enableDevelopmentFeatures(): boolean {
  if (Disable) {
    return false
  }

  if (__DEV__) {
    return true
  }

  if (process.env.GITHUB_DESKTOP_PREVIEW_FEATURES === '1') {
    return true
  }

  return false
}

/** Should the app enable beta features? */
//@ts-ignore: this will be used again in the future
function enableBetaFeatures(): boolean {
  return enableDevelopmentFeatures() || __RELEASE_CHANNEL__ === 'beta'
}
