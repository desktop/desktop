import { IParseNode, NodeType } from './actions-log-parser-objects'

export enum Resets {
  Reset = '0',
  Bold = '22',
  Italic = '23',
  Underline = '24',
  Set_Fg = '38',
  Default_Fg = '39',
  Set_Bg = '48',
  Default_Bg = '49',
}

export const specials = {
  '1': 'bold',
  '3': 'italic',
  '4': 'underline',
} as { [key: string]: string }

export const bgColors = {
  // 40 (black), 41 (red), 42 (green), 43 (yellow), 44 (blue), 45 (magenta), 46 (cyan), 47 (white), 100 (grey)
  '40': 'b',
  '41': 'r',
  '42': 'g',
  '43': 'y',
  '44': 'bl',
  '45': 'm',
  '46': 'c',
  '47': 'w',
  '100': 'gr',
} as { [key: string]: string }

export const fgColors = {
  // 30 (black), 31 (red), 32 (green), 33 (yellow), 34 (blue), 35 (magenta), 36 (cyan), 37 (white), 90 (grey)
  '30': 'b',
  '31': 'r',
  '32': 'g',
  '33': 'y',
  '34': 'bl',
  '35': 'm',
  '36': 'c',
  '37': 'w',
  '90': 'gr',
} as { [key: string]: string }

export const base8BitColors = {
  // 0 (black), 1 (red), 2 (green), 3 (yellow), 4 (blue), 5 (magenta), 6 (cyan), 7 (white), 8 (grey)
  '0': 'b',
  '1': 'r',
  '2': 'g',
  '3': 'y',
  '4': 'bl',
  '5': 'm',
  '6': 'c',
  '7': 'w',
} as Record<string, string>

//0-255 in 6 increments, used to generate 216 equally incrementing colors
export const colorIncrements216 = {
  0: 0,
  1: 51,
  2: 102,
  3: 153,
  4: 204,
  5: 255,
} as Record<number, number>

export const PLAIN = 'plain'
export const COMMAND = 'command'
export const DEBUG = 'debug'
export const ERROR = 'error'
export const INFO = 'info'
export const SECTION = 'section'
export const VERBOSE = 'verbose'
export const WARNING = 'warning'
export const GROUP = 'group'
export const END_GROUP = 'endgroup'
export const ICON = 'icon'
export const NOTICE = 'notice'

export const commandToType: { [command: string]: NodeType } = {
  command: NodeType.Command,
  debug: NodeType.Debug,
  error: NodeType.Error,
  info: NodeType.Info,
  section: NodeType.Section,
  verbose: NodeType.Verbose,
  warning: NodeType.Warning,
  notice: NodeType.Notice,
  group: NodeType.Group,
  endgroup: NodeType.EndGroup,
  icon: NodeType.Icon,
}

export const typeToCommand: { [type: string]: string } = {
  '0': PLAIN,
  '1': COMMAND,
  '2': DEBUG,
  '3': ERROR,
  '4': INFO,
  '5': SECTION,
  '6': VERBOSE,
  '7': WARNING,
  '8': GROUP,
  '9': END_GROUP,
  '10': ICON,
  '11': NOTICE,
}

// Store the max command length we support, for example, we support "section", "command" which are of length 7, which highest of all others
export const maxCommandLength = 8
export const supportedCommands = [
  COMMAND,
  DEBUG,
  ERROR,
  INFO,
  SECTION,
  VERBOSE,
  WARNING,
  GROUP,
  END_GROUP,
  ICON,
  NOTICE,
]

export function getType(node: IParseNode) {
  return typeToCommand[node.type]
}
