import { IArgv as mriArgv } from 'mri'

import { TypeName } from './util'

type StringArray = ReadonlyArray<string>

const files: StringArray = require('./command-list.json')

export type CommandHandler = (args: mriArgv, argv: StringArray) => void
export { mriArgv }

export interface IOption {
  readonly type: TypeName
  readonly aliases?: StringArray
  readonly description: string
  readonly default?: any
}

interface IArgument {
  readonly name: string
  readonly required: boolean
  readonly description: string
  readonly type: TypeName
}

export interface ICommandModule {
  name?: string
  readonly command: string
  readonly description: string
  readonly handler: CommandHandler
  readonly aliases?: StringArray
  readonly options?: { [flag: string]: IOption }
  readonly args?: ReadonlyArray<IArgument>
  readonly unknownOptionHandler?: (flag: string) => void
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
