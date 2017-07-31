import * as yargs from 'yargs'

yargs
  .commandDir('./commands', {
    recurse: true,
    extensions: ['ts']
  })
  .help()
  .argv
