const Fs = require('fs')
const path = require('path')

global.__CLI_COMMANDS__ = Fs.readdirSync(path.join(__dirname, 'commands'))
  .filter(name => name.endsWith('.ts'))
  .map(name => name.replace(/\.ts$/, ''))
