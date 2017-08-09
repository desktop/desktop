import * as QueryString from 'querystring'
import { URL } from 'url'

import { CommandError } from '../util'
import { openDesktop } from '../open-desktop'
import { ICommandModule, mriArgv } from '../load-commands'

interface ICloneArgs extends mriArgv {
  branch?: string
}

const command: ICommandModule = {
  command: 'clone <url|slug> [path]',
  description: 'Clone a repository',
  args: [
    {
      name: 'url|slug',
      required: true,
      description: 'The URL to clone, or the GitHub repo slug to clone',
      type: 'string',
    },
    {
      name: 'path',
      required: false,
      description: 'The path to clone to',
      type: 'string',
    },
  ],
  options: {
    branch: {
      type: 'string',
      aliases: ['b'],
      description: 'The branch to switch to after cloning',
    },
  },
  handler({ _: [cloneUrl, path], branch }: ICloneArgs) {
    if (!cloneUrl) {
      throw new CommandError('Clone URL must be specified')
    }
    try {
      const _ = new URL(cloneUrl)
      _.toString() // don’t mark as unused
    } catch (e) {
      // invalid URL, assume a GitHub repo
      cloneUrl = `https://github.com/${cloneUrl}`
    }
    if (!path) {
      const urlComponents = cloneUrl.split('/')
      path = urlComponents[urlComponents.length - 1]
    }
    const url = `x-github-client://openRepo/${cloneUrl}?${QueryString.stringify(
      {
        branch,
        filepath: path,
      }
    )}`
    openDesktop(url)
  },
}
export = command
