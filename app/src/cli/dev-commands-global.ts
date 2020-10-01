import { getCLICommands } from '../../../app/app-info'

const g: any = global
g.__CLI_COMMANDS__ = getCLICommands()
