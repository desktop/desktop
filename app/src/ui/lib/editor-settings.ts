import {
  IEditorSettings,
  EditorTheme,
  EditorDefaultMode,
  EditorModeLock,
  defaultEditorSettings,
} from '../../models/preferences'

const editorSettingsKey = 'editorSettings'

/**
 * Get the persisted editor settings from localStorage
 */
export function getPersistedEditorSettings(): IEditorSettings {
  const stored = localStorage.getItem(editorSettingsKey)

  if (!stored) {
    return defaultEditorSettings
  }

  try {
    const parsed = JSON.parse(stored)
    // Merge with defaults to handle any missing fields from older versions
    return {
      ...defaultEditorSettings,
      ...parsed,
      // Ensure enum values are valid
      theme: Object.values(EditorTheme).includes(parsed.theme)
        ? parsed.theme
        : defaultEditorSettings.theme,
      defaultMode: Object.values(EditorDefaultMode).includes(parsed.defaultMode)
        ? parsed.defaultMode
        : defaultEditorSettings.defaultMode,
      modeLock: Object.values(EditorModeLock).includes(parsed.modeLock)
        ? parsed.modeLock
        : defaultEditorSettings.modeLock,
    }
  } catch {
    return defaultEditorSettings
  }
}

/**
 * Persist editor settings to localStorage
 */
export function setPersistedEditorSettings(settings: IEditorSettings): void {
  localStorage.setItem(editorSettingsKey, JSON.stringify(settings))
}
