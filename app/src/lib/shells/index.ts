import * as Darwin from './darwin'
import * as Win32 from './win32'

export type Shell = Darwin.Shell | Win32.Shell

export { getAvailableShells } from './lookup'
export { launchShell } from './launch'
