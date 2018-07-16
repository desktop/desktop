import * as fs from 'fs'
import * as Path from 'path'

import { getSHA } from './git-info'
import { getUpdatesURL, getReleaseChannel } from '../script/dist-info'

const projectRoot = Path.dirname(__dirname)

const devClientId = '3a723b10ac5575cc5bb9'
const devClientSecret = '22c34d87789a365981ed921352a7b9a8c3f69d54'

const channel = getReleaseChannel()

export function getCLICommands() {
  return (
    // eslint-disable-next-line no-sync
    fs
      .readdirSync(Path.resolve(projectRoot, 'app', 'src', 'cli', 'commands'))
      .filter(name => name.endsWith('.ts'))
      .map(name => name.replace(/\.ts$/, ''))
  )
}

const s = JSON.stringify

export function getReplacements() {
  return {
    __OAUTH_CLIENT_ID__: s(process.env.DESKTOP_OAUTH_CLIENT_ID || devClientId),
    __OAUTH_SECRET__: s(
      process.env.DESKTOP_OAUTH_CLIENT_SECRET || devClientSecret
    ),
    __DARWIN__: process.platform === 'darwin',
    __WIN32__: process.platform === 'win32',
    __LINUX__: process.platform === 'linux',
    __DEV__: channel === 'development',
    __RELEASE_CHANNEL__: s(channel),
    __UPDATES_URL__: s(getUpdatesURL()),
    __SHA__: s(getSHA()),
    __CLI_COMMANDS__: s(getCLICommands()),
    'process.platform': s(process.platform),
    'process.env.NODE_ENV': s(process.env.NODE_ENV || 'development'),
    'process.env.TEST_ENV': s(process.env.TEST_ENV),
  }
}
