export enum AppUpdateChannel {
  Stable = 'Stable',
  Beta = 'Beta',
}

export const defaultAppUpdateChannel =
  __RELEASE_CHANNEL__ === 'beta'
    ? AppUpdateChannel.Beta
    : AppUpdateChannel.Stable
