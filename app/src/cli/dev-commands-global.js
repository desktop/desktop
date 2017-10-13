const Fs = require('fs')
const path = require('path')

const distInfo = require('../../../script/dist-info')

global.__CLI_COMMANDS__ = distInfo.getCLICommands()
