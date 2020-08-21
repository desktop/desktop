import mri, {
  DictionaryObject,
  Options as MriOptions,
  ArrayOrString,
} from 'mri'
import chalk from 'chalk'

import { dasherizeOption, CommandError } from './util'
import { commands } from './load-commands'
const defaultCommand = 'open'

let args = process.argv.slice(2)
if (!args[0]) {
  args[0] = '.'
}
const commandArg = args[0]
args = args.slice(1)

// tslint:disable-next-line whitespace
;(function attemptRun(name: string) {
  try {
    if (supportsCommand(name)) {
      runCommand(name)
    } else if (name.startsWith('--')) {
      attemptRun(name.slice(2))
    } else {
      try {
        args.unshift(commandArg)
        runCommand(defaultCommand)
      } catch (err) {
        logError(err)
        args = []
        runCommand('help')
      }
    }
  } catch (err) {
    logError(err)
    args = [name]
    runCommand('help')
  }
})(commandArg)

function logError(err: CommandError) {
  console.log(chalk.bgBlack.red('ERR!'), err.message)
  if (err.stack && !err.pretty) {
    console.log(chalk.gray(err.stack))
  }
}

console.log() // nice blank line before the command prompt

interface IMRIOpts extends MriOptions {
  alias: DictionaryObject<ArrayOrString>
  boolean: Array<string>
  default: DictionaryObject
  string: Array<string>
}

function runCommand(name: string) {
  const command = commands[name]
  const opts: IMRIOpts = {
    alias: {},
    boolean: [],
    default: {},
    string: [],
  }
  if (command.options) {
    for (const flag of Object.keys(command.options)) {
      const flagOptions = command.options[flag]
      if (flagOptions.aliases) {
        opts.alias[flag] = flagOptions.aliases
      }
      if (flagOptions.hasOwnProperty('default')) {
        opts.default[flag] = flagOptions.default
      }
      switch (flagOptions.type) {
        case 'string':
          opts.string.push(flag)
          break
        case 'boolean':
          opts.boolean.push(flag)
          break
      }
    }
    opts.unknown = command.unknownOptionHandler
  }
  const parsedArgs = mri(args, opts)
  if (command.options) {
    for (const flag of Object.keys(parsedArgs)) {
      if (!(flag in command.options)) {
        continue
      }

      const value = parsedArgs[flag]
      const expectedType = command.options[flag].type
      if (typeof value !== expectedType) {
        throw new CommandError(
          `Value passed to flag ${dasherizeOption(
            flag
          )} was of type ${typeof value}, but was expected to be of type ${expectedType}`
        )
      }
    }
  }
  command.handler(parsedArgs, args)
}
function supportsCommand(name: string) {
  return Object.prototype.hasOwnProperty.call(commands, name)
}
