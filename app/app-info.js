'use strict'

const fs = require('fs')
const path = require('path')

const gitInfo = require('./git-info')
const distInfo = require('../script/dist-info')

const projectRoot = path.join(__dirname, '..')

const devClientId = '3a723b10ac5575cc5bb9'
const devClientSecret = '22c34d87789a365981ed921352a7b9a8c3f69d54'

const channel = distInfo.getReleaseChannel()

function getCLICommands() {
  return (
    // eslint-disable-next-line no-sync
    fs
      .readdirSync(path.resolve(projectRoot, 'app', 'src', 'cli', 'commands'))
      .filter(name => name.endsWith('.ts'))
      .map(name => name.replace(/\.ts$/, ''))
  )
}

function s(text) {
  return JSON.stringify(text)
}

function getMenuPlaceholders() {
  if (process.platform === 'darwin') {
    return {
      __MENU_SHOW_LOGS_IN_FILE_MANAGER__: s('Show Logs in Finder'),
      __MENU_SHOW_IN_FILE_MANAGER__: s('Show in Finder'),
    }
  }
  if (process.platform === 'win32') {
    return {
      __MENU_SHOW_LOGS_IN_FILE_MANAGER__: s('S&how Logs in Explorer'),
      __MENU_SHOW_IN_FILE_MANAGER__: s('Show in E&xplorer'),
    }
  }
  return {
    __MENU_SHOW_LOGS_IN_FILE_MANAGER__: s('Show logs in File Manager'),
    __MENU_SHOW_IN_FILE_MANAGER__: s('Show in File Manager'),
  }
}

function getPlatformPlaceholders() {
  if (process.platform === 'darwin') {
    return {
      __LABEL_SHOW_IN_FILE_MANAGER__: s('Show in Finder'),
      __LABEL_REVEAL_IN_FILE_MANAGER__: s('Reveal in Finder'),
      __LABEL_FILE_MANAGER_NAME__: s('Finder'),
    }
  }
  if (process.platform === 'win32') {
    return {
      __LABEL_SHOW_IN_FILE_MANAGER__: s('Show in Explorer'),
      __LABEL_REVEAL_IN_FILE_MANAGER__: s('Show in Explorer'),
      __LABEL_FILE_MANAGER_NAME__: s('Explorer'),
    }
  }
  return {
    __LABEL_SHOW_IN_FILE_MANAGER__: s('Show in File Manager'),
    __LABEL_REVEAL_IN_FILE_MANAGER__: s('Show in File Manager'),
    __LABEL_FILE_MANAGER_NAME__: s('File Manager'),
  }
}

function getReplacements() {
  const replacements = {
    __OAUTH_CLIENT_ID__: s(process.env.DESKTOP_OAUTH_CLIENT_ID || devClientId),
    __OAUTH_SECRET__: s(
      process.env.DESKTOP_OAUTH_CLIENT_SECRET || devClientSecret
    ),
    __DARWIN__: process.platform === 'darwin',
    __WIN32__: process.platform === 'win32',
    __LINUX__: process.platform === 'linux',
    __DEV__: channel === 'development',
    __RELEASE_CHANNEL__: s(channel),
    __UPDATES_URL__: s(distInfo.getUpdatesURL()),
    __SHA__: s(gitInfo.getSHA()),
    __CLI_COMMANDS__: s(getCLICommands()),
    'process.platform': s(process.platform),
    'process.env.NODE_ENV': s(process.env.NODE_ENV || 'development'),
    'process.env.TEST_ENV': s(process.env.TEST_ENV),
  }

  return Object.assign(
    replacements,
    getMenuPlaceholders(),
    getPlatformPlaceholders()
  )
}

module.exports = { getReplacements, getCLICommands }
