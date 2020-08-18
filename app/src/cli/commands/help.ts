import chalk from 'chalk'

import { commands, ICommandModule, IOption } from '../load-commands'

import { dasherizeOption, printTable } from '../util'

export const command: ICommandModule = {
  command: 'help [command]',
  description: 'Show the help page for a command',
  handler({ _: [command] }) {
    if (command) {
      printCommandHelp(command, commands[command])
    } else {
      printHelp()
    }
  },
}

function printHelp() {
  console.log(chalk.underline('Commands:'))
  const table: string[][] = []
  for (const commandName of Object.keys(commands)) {
    const command = commands[commandName]
    table.push([chalk.bold(command.command), command.description])
  }
  printTable(table)
  console.log(
    `\nRun ${chalk.bold(
      `github help ${chalk.gray('<command>')}`
    )} for details about each command`
  )
}

function printCommandHelp(name: string, command: ICommandModule) {
  if (!command) {
    console.log(`Unrecognized command: ${chalk.bold.red.underline(name)}`)
    printHelp()
    return
  }
  console.log(`${chalk.gray('github')} ${command.command}`)
  if (command.aliases) {
    for (const alias of command.aliases) {
      console.log(chalk.gray(`github ${alias}`))
    }
  }
  console.log()
  const [title, body] = command.description.split('\n', 1)
  console.log(chalk.bold(title))
  if (body) {
    console.log(body)
  }
  const { options, args } = command
  if (options) {
    console.log(chalk.underline('\nOptions:'))
    printTable(
      Object.keys(options)
        .map(k => [k, options[k]] as [string, IOption])
        .map(([optionName, option]) => [
          [optionName, ...(option.aliases || [])]
            .map(dasherizeOption)
            .map(x => chalk.bold.blue(x))
            .join(chalk.gray(', ')),
          option.description,
          chalk.gray(`[${chalk.underline(option.type)}]`),
        ])
    )
  }
  if (args && args.length) {
    console.log(chalk.underline('\nArguments:'))
    printTable(
      args.map(arg => [
        (arg.required ? chalk.bold : chalk).blue(arg.name),
        arg.required ? chalk.gray('(required)') : '',
        arg.description,
        chalk.gray(`[${chalk.underline(arg.type)}]`),
      ])
    )
  }
}
