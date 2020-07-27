import { promisify } from 'util'
import { join } from 'path'

import glob = require('glob')
const globPromise = promisify(glob)

import { rename } from 'fs-extra'

import { getVersion } from '../app/package-info'
import { getDistPath, getDistRoot } from './dist-info'

const distRoot = getDistRoot()

// best guess based on documentation
type RedhatOptions = {
  // required
  src: string
  dest: string
  arch: 'x86_64'
  // optional
  description?: string
  productDescription?: string
  categories?: Array<string>
  icon?: any
  scripts?: {
    pre?: string
    post?: string
    preun?: string
    postun?: string
  }
  homepage?: string
  mimeType?: Array<string>
  requires?: Array<string>
}

const options: RedhatOptions = {
  src: getDistPath(),
  dest: distRoot,
  arch: 'x86_64',
  description: 'Simple collaboration from your desktop',
  productDescription:
    'This is the unofficial port of GitHub Desktop for Linux distributions',
  categories: ['GNOME', 'GTK', 'Development'],
  requires: [
    // default Electron dependencies
    'libXScrnSaver',
    'libX11-xcb',
    'alsa-lib',
    // dugite-native dependencies
    '(libcurl or libcurl4)',
    // keytar dependencies
    'libsecret',
    'gnome-keyring',
  ],
  icon: {
    '256x256': 'app/static/logos/256x256.png',
    '512x512': 'app/static/logos/512x512.png',
    '1024x1024': 'app/static/logos/1024x1024.png',
  },
  scripts: {
    post: 'script/resources/rpm/post.sh',
    preun: 'script/resources/rpm/preun.sh',
  },
  homepage: 'https://github.com/shiftkey/desktop',
  mimeType: [
    'x-scheme-handler/x-github-client',
    'x-scheme-handler/x-github-desktop-auth',
    // workaround for handling OAuth flow until we figure out what we're doing
    // with the development OAuth details
    //
    // see https://github.com/shiftkey/desktop/issues/72 for more details
    'x-scheme-handler/x-github-desktop-dev-auth',
  ],
}

export async function packageRedhat(): Promise<string> {
  if (process.platform === 'win32') {
    return Promise.reject('Windows is not supported')
  }

  const installer = require('electron-installer-redhat')

  await installer(options)
  const installersPath = `${distRoot}/github-desktop*.rpm`

  const files = await globPromise(installersPath)

  if (files.length !== 1) {
    return Promise.reject(
      `Expected one file but instead found '${files.join(', ')}' - exiting...`
    )
  }

  const oldPath = files[0]

  const newFileName = `GitHubDesktop-linux-${getVersion()}.rpm`
  const newPath = join(distRoot, newFileName)
  await rename(oldPath, newPath)

  return Promise.resolve(newPath)
}
