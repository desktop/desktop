export enum PreferencesTab {
  Accounts,
  Integrations,
  Git,
  Appearance,
  Notifications,
  Prompts,
  Advanced,
  Accessibility,
}

export interface IPreferences {
  readonly automaticSignOff: boolean
}
