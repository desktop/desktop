import * as QueryString from 'querystring'
import { URL } from 'url'

import { CommandError } from '../util'
import { openDesktop } from '../open-desktop'
import { ICommandModule, mriArgv } from '../load-commands'

interface ICloneArgs extends mriArgv {
  readonly branch?: string
}

export const command: ICommandModule = {
  command: 'clone <url|slug>',
  description: 'Clone a repository',
  args: [
    {
      name: 'url|slug',
      required: true,
      description: 'The URL or the GitHub owner/name alias to clone',
      type: 'string',
    },
  ],
  options: {
    branch: {
      type: 'string',
      aliases: ['b'],
      description: 'The branch to checkout after cloning',
    },
  },
  handler({ _: [cloneUrl], branch }: ICloneArgs) {
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
    const url = `openRepo/${cloneUrl}?${QueryString.stringify({
      branch,
    })}`
    openDesktop(url)
  },
}
