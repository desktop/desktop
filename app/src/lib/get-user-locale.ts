import { getAppleLocale } from '../ui/main-process-proxy'
import { getUserLocale as getWindowsUserLocale } from 'win32-user-locale'

export const getUserLocale = async () => {
  if (__WIN32__) {
    return getWindowsUserLocale()
  } else if (__DARWIN__) {
    const locale = await getAppleLocale()
    return locale.length > 0 ? locale : undefined
  } else {
    const keys = ['LC_ALL', 'LC_MESSAGES', 'LANG', 'LANGUAGE']
    return keys.map(k => process.env[k]).find(x => x)
  }
}
