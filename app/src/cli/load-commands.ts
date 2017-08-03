import { IArgv as mriArgv } from 'mri'

import { TypeName } from './util'

type StringArray = ReadonlyArray<string>

const files: StringArray = require('./command-list.json')

export type CommandHandler = (
  args: mriArgv,
  argv: StringArray
) => void
export { mriArgv }

export interface IOption {
  type: TypeName
  aliases?: StringArray
  description: string
  default?: any
}

interface IArgument {
  name: string
  required: boolean
  description: string
  type: TypeName
}

export interface ICommandModule {
  name?: string
  command: string
  description: string
  handler: CommandHandler
  aliases?: StringArray
  options?: { [flag: string]: IOption }
  args?: ReadonlyArray<IArgument>
  unknownOptionHandler?: (flag: string) => void
}

const loadModule: (name: string) => ICommandModule = name =>
  require(`./commands/${name}.ts`)

interface ICommands {
  [command: string]: ICommandModule
}
export const commands: ICommands = {}

for (const fileName of files) {
  const mod = loadModule(fileName)
  if (!mod.name) {
    mod.name = fileName
  }
  commands[mod.name] = mod
}
