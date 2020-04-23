import { promisify } from 'util'
import { join } from 'path'

import * as glob from 'glob'
const globPromise = promisify(glob)

import { rename } from 'fs-extra'

import { getVersion } from '../app/package-info'
import { getDistPath, getDistRoot } from './dist-info'

const distRoot = getDistRoot()

// best guess based on documentation
type DebianOptions = {
  // required
  src: string
  dest: string
  arch: 'amd64' | 'i386' | 'arm64'
  // optional
  description?: string
  productDescription?: string
  categories?: Array<string>
  section?: string
  priority?: 'required' | 'important' | 'standard' | 'optional' | 'extra'
  homepage?: string
  icon?: any
  scripts?: {
    preinst?: string
    postinst?: string
    prerm?: string
    postrm?: string
  }
  mimeType?: Array<string>
  maintainer?: string
  depends?: Array<string>
}

const options: DebianOptions = {
  src: getDistPath(),
  dest: distRoot,
  arch: 'amd64',
  description: 'Simple collaboration from your desktop',
  productDescription:
    'This is the unofficial port of GitHub Desktop for Linux distributions',
  section: 'GNOME;GTK;Development',
  priority: 'extra',
  homepage: 'https://github.com/shiftkey/desktop',
  depends: [
    // additional core dependencies - are these still needed?
    'gconf2',
    'gconf-service',
    'libappindicator1',
    // Desktop-specific dependencies
    'libcurl3 | libcurl4',
    'libsecret-1-0',
    'gnome-keyring',
  ],
  icon: {
    '256x256': 'app/static/logos/256x256.png',
    '512x512': 'app/static/logos/512x512.png',
    '1024x1024': 'app/static/logos/1024x1024.png',
  },
  scripts: {
    postinst: 'script/resources/deb/postinst.sh',
    postrm: 'script/resources/deb/postrm.sh',
  },
  mimeType: [
    'x-scheme-handler/x-github-client',
    'x-scheme-handler/x-github-desktop-auth',
    // workaround for handling OAuth flow until we figure out what we're doing
    // with the development OAuth details
    //
    // see https://github.com/shiftkey/desktop/issues/72 for more details
    'x-scheme-handler/x-github-desktop-dev-auth',
  ],
  maintainer: 'Brendan Forster <github@brendanforster.com>',
}

export async function packageDebian(): Promise<string> {
  if (process.platform === 'win32') {
    return Promise.reject('Windows is not supported')
  }

  const installer = require('electron-installer-debian')

  await installer(options)
  const installersPath = `${distRoot}/github-desktop*.deb`

  const files = await globPromise(installersPath)

  if (files.length !== 1) {
    return Promise.reject(
      `Expected one file but instead found '${files.join(', ')}' - exiting...`
    )
  }

  const oldPath = files[0]

  const newFileName = `GitHubDesktop-linux-${getVersion()}.deb`
  const newPath = join(distRoot, newFileName)
  await rename(oldPath, newPath)

  return Promise.resolve(newPath)
}
