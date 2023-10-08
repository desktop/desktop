import { writeFile } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { TitleBarStyle } from '../ui/lib/title-bar-style'

export type TitleBarConfig = {
  titleBarStyle: TitleBarStyle
}

let cachedTitleBarConfig: TitleBarConfig | null = null

// The function has to be synchronous,
// since we need its return value to create electron BrowserWindow
export function readTitleBarConfigFileSync(): TitleBarConfig {
  if (cachedTitleBarConfig) {
    return cachedTitleBarConfig
  }

  const titleBarConfigPath = getTitleBarConfigPath()

  if (existsSync(titleBarConfigPath)) {
    const storedTitleBarConfig = JSON.parse(
      readFileSync(titleBarConfigPath, 'utf8')
    )

    if (
      storedTitleBarConfig.titleBarStyle === 'native' ||
      storedTitleBarConfig.titleBarStyle === 'custom'
    ) {
      cachedTitleBarConfig = storedTitleBarConfig
    }
  }

  // Cache the default value if the config file is not found, or if it contains an invalid value.
  if (cachedTitleBarConfig == null) {
    cachedTitleBarConfig = { titleBarStyle: 'native' }
  }

  return cachedTitleBarConfig
}

export function saveTitleBarConfigFile(config: TitleBarConfig) {
  return writeFile(getTitleBarConfigPath(), JSON.stringify(config), 'utf8')
}

const getTitleBarConfigPath = () =>
  join(app.getPath('userData'), '.title-bar-config')
