export const enum NodeType {
  Plain = 0,
  Command = 1,
  Debug = 2,
  Error = 3,
  Info = 4,
  Section = 5,
  Verbose = 6,
  Warning = 7,
  Group = 8,
  EndGroup = 9,
  Icon = 10,
  Notice = 11,
}

// Set max to prevent any perf degradations
export const maxLineMatchesToParse = 100
export const unsetValue = -1
export const newLineChar = '\n'
export const hashChar = '#'
export const commandStart = '['
export const commandEnd = ']'

interface IGroupInfo {
  lineIndex: number
  nodeIndex: number
}

export interface ISectionFind {
  line: number
}

export interface IParseNode {
  type: NodeType
  /**
   * Index of the node inside ILine
   */
  index: number
  /**
   * Index of the ILine this node belongs to
   */
  lineIndex: number
  /**
   * Starting index of content
   */
  start: number
  /**
   * Ending index of content
   */
  end: number
  /**
   * If this is part of a group, this will refer to the node that's a group
   */
  group?: IGroupInfo
  /**
   * If this is a group, this would be set
   */
  isGroup?: boolean
}

export interface ILine {
  nodes: ReadonlyArray<IParseNode>
}

export interface IStyle {
  fg: string
  bg: string
  isFgRGB: boolean
  isBgRGB: boolean
  bold: boolean
  italic: boolean
  underline: boolean
  [key: string]: boolean | string
}

export interface IRGBColor {
  r: number
  g: number
  b: number
}

export interface IAnsiEscapeCodeState {
  output: string
  style?: IStyle
}

export interface IParsedOutput {
  entry: string
  entryUrl?: string
  afterUrl?: string
}
export interface IParsedContent {
  classes: ReadonlyArray<string>
  styles: ReadonlyArray<string>
  output: ReadonlyArray<IParsedOutput>
}

export interface ILogLine extends IParseNode {
  text?: string
}

export interface ILogLineTemplateData {
  className: string
  lineNumber: number
  lineContent: ReadonlyArray<IParsedContent>
  timeStamp?: string
  lineUrl: string
  isGroup: boolean
  inGroup: boolean
  isError: boolean
  isWarning: boolean
  isNotice: boolean
  groupExpanded: boolean
}
