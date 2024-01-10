import { Argv as mriArgv } from 'mri'

import { TypeName } from './util'

type StringArray = ReadonlyArray<string>

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

function loadModule(name: string): ICommandModule {
  return require(`./commands/${name}.ts`).command
}

interface ICommands {
  [command: string]: ICommandModule
}
export const commands: ICommands = {}

for (const fileName of __CLI_COMMANDS__) {
  const mod = loadModule(fileName)
  if (!mod.name) {
    mod.name = fileName
  }
  commands[mod.name] = mod
}
