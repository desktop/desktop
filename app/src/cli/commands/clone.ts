import * as QueryString from 'querystring'
import { URL } from 'url'

import * as yargs from 'yargs'

import { openDesktop } from '../open-desktop'

interface ICloneArgs {
  url?: string,
  pr?: number,
  branch?: string,
  path?: string,
}

export const command = 'clone <url|slug> [path]'
export const describe = 'Clone a repository'
export const builder = (yargs: yargs.Argv) => {
  yargs.options({
    pr: {
      alias: 'p',
      type: 'number',
      describe: 'the PR to open',
    },
    branch: {
      alias: 'b',
      type: 'string',
      describe: 'the branch to switch to',
    },
  }).check((argv) => {
    const { pr, url: cloneUrl } = argv as ICloneArgs
    if (!cloneUrl) {
      throw new Error('Clone URL must be specified')
    }
    if (Number.isNaN(pr as number)) {
      throw new Error('PR number must be a valid number.')
    }
    return true // checks passed
  }, false)
}

export const handler = ({ url: cloneUrl, pr, branch, path }: ICloneArgs) => {
  if (!cloneUrl) {
    throw new TypeError('No clone URL specified')
  }
  try {
    const _ = new URL(cloneUrl)
    _.toString() // don’t mark as unused
  } catch (e) {
    // invalid URL, assume a GitHub repo
    cloneUrl = `https://github.com/${cloneUrl}`
  }
  if (pr) {
    branch = 'pr/' + pr
  } else if (Number.isNaN(pr as number)) {
    throw new TypeError('Invalid PR number')
  }
  if (!path) {
    const urlComponents = cloneUrl.split('/')
    path = urlComponents[urlComponents.length - 1]
  }
  const url = `x-github-client://openRepo/${cloneUrl}?${QueryString.stringify({
    pr,
    branch,
    filepath: path
  })}`
  openDesktop(url)
}
