import {
  base8BitColors,
  bgColors,
  colorIncrements216,
  COMMAND,
  commandToType,
  END_GROUP,
  ERROR,
  fgColors,
  getType,
  GROUP,
  ICON,
  maxCommandLength,
  NOTICE,
  Resets,
  SECTION,
  specials,
  supportedCommands,
  WARNING,
} from './action-log-pipeline-commands'
import {
  commandEnd,
  commandStart,
  hashChar,
  IAnsiEscapeCodeState,
  ILine,
  ILogLine,
  ILogLineTemplateData,
  IParsedContent,
  IParsedOutput,
  IParseNode,
  IRGBColor,
  IStyle,
  newLineChar,
  NodeType,
  unsetValue,
} from './actions-log-parser-objects'
import {
  BrightClassPostfix,
  ESC,
  TimestampLength,
  TimestampRegex,
  UrlRegex,
  _ansiEscapeCodeRegex,
} from './actions-logs-ansii'

export function getText(text: string) {
  return (text || '').toLocaleLowerCase()
}

export class ActionsLogParser {
  private logLines: ILogLine[]
  private logContent: string
  private rawLogData: string
  private lineMetaData: ILine[]
  private logLineNumbers: number[]
  private timestamps: string[]
  /**
   * This is used a prefix to the line number if we would want the line numbers
   * to be links to dotcom logs.
   *
   * Example: https://github.com/desktop/desktop/runs/3840220073#step:13
   */
  private permalinkPrefix: string

  public constructor(rawLogData: string, permalinkPrefix: string) {
    this.rawLogData = rawLogData
    this.permalinkPrefix = permalinkPrefix
    this.logContent = ''
    this.lineMetaData = []
    this.logLines = []
    this.logLineNumbers = []
    this.timestamps = []
    this.updateLogLines()
  }

  /**
   * Returns the parsed lines in the form of an object with the meta data needed
   * to build a an html element for the line.
   *
   * @param node
   * @param groupExpanded
   * @returns
   */
  public getParsedLogLinesTemplateData(): ReadonlyArray<ILogLineTemplateData> {
    return this.logLines.map(ll => this.getParsedLineTemplateData(ll))
  }

  /**
   * Returns a line object with the meta data needed to build a an html element
   * for the line.
   *
   */
  private getParsedLineTemplateData(node: ILogLine): ILogLineTemplateData {
    const { lineIndex } = node
    const logLineNumber = this.logLineNumbers[lineIndex]
    const lineNumber = logLineNumber != null ? logLineNumber : lineIndex + 1
    const text = this.getNodeText(node)

    // parse() does the ANSI parsing and converts to HTML
    const lineContent = this.parse(text)

    // The parser assigns a type to each line. Such as "debug" or "command".
    // These change the way the line looks. See checks.scss for the css.
    const className = `log-line-${getType(node)}`

    return {
      className,
      lineNumber,
      lineContent,
      timeStamp: this.timestamps[lineIndex],
      lineUrl: `${this.permalinkPrefix}:${lineNumber}`,
      isGroup: node.type === NodeType.Group,
      inGroup: node.group?.lineIndex != null,
      isError: node.type === NodeType.Error,
      isWarning: node.type === NodeType.Warning,
      isNotice: node.type === NodeType.Notice,
      groupExpanded: false,
    }
  }

  private updateLogLines() {
    this.updateLineMetaData()

    this.logLines = []
    for (const line of this.lineMetaData) {
      this.logLines.push(...line.nodes)
    }
  }

  private updateLineMetaData() {
    const lines = this.rawLogData.split(/\r?\n/)
    // Example log line with timestamp:
    // 2019-07-11T16:56:45.9315998Z #[debug]Evaluating condition for step: 'fourth step'
    const timestampRegex = /^(.{27}Z) /

    this.timestamps = []
    this.logContent = lines
      .map(line => {
        const match = line.match(timestampRegex)
        const timestamp = match && new Date(match[1])

        let ts = ''
        if (match && timestamp && !isNaN(Number(timestamp))) {
          ts = timestamp.toUTCString()
          line = line.substring(match[0].length)
        }

        if (!line.startsWith('##[endgroup]')) {
          // endgroup lines are not rendered and do not increase the lineIndex, so we don't want to store a timestamp for them,
          // otherwise we will get wrong timestamps in subsequent lines
          this.timestamps.push(ts)
        }
        return line
      })
      .join('\n')

    this.lineMetaData = this.parseLines(this.logContent)
  }

  private getNodeText(node: ILogLine) {
    if (node.text == null) {
      node.text = this.logContent.substring(node.start, node.end + 1)
    }
    return node.text
  }

  /**
   * Converts the content to HTML with appropriate styles, escapes content to prevent XSS
   *
   * @param content
   * @param lineNumber
   */
  private parse(content: string): IParsedContent[] {
    const result = []
    const states = this.getStates(content)
    for (const x of states) {
      const classNames: string[] = []
      const styles: string[] = []
      const currentText = x.output
      if (x.style) {
        const fg = x.style.fg
        const bg = x.style.bg
        const isFgRGB = x.style.isFgRGB
        const isBgRGB = x.style.isBgRGB
        if (fg && !isFgRGB) {
          classNames.push(`ansifg-${fg}`)
        }
        if (bg && !isBgRGB) {
          classNames.push(`ansibg-${bg}`)
          classNames.push(`d-inline-flex`)
        }
        if (fg && isFgRGB) {
          styles.push(`color:rgb(${fg})`)
        }
        if (bg && isBgRGB) {
          styles.push(`background-color:rgb(${bg})`)
          classNames.push(`d-inline-flex`)
        }
        if (x.style.bold) {
          classNames.push('text-bold')
        }
        if (x.style.italic) {
          classNames.push('text-italic')
        }
        if (x.style.underline) {
          classNames.push('text-underline')
        }
      }

      const output: IParsedOutput[] = []

      // Split the current text using the URL Regex pattern, if there are no URLs, there were will be single entry
      const splitUrls = currentText.split(UrlRegex)
      for (const entry of splitUrls) {
        if (entry === '') {
          continue
        }
        if (entry.match(UrlRegex)) {
          const prefixMatch = entry.match(/^[{(<[]*/)
          const entryPrefix = prefixMatch == null ? '' : prefixMatch[0]
          let entrySuffix = ''
          if (entryPrefix) {
            const suffixRegex = new RegExp(
              `[})>\\]]{${entryPrefix.length}}(?=$)`
            )
            const suffixMatch = entry.match(suffixRegex)
            entrySuffix = suffixMatch == null ? '' : suffixMatch[0]
          }
          const entryUrl = entry
            .replace(entryPrefix, '')
            .replace(entrySuffix, '')

          output.push({
            entry: entryPrefix,
            entryUrl,
            afterUrl: entrySuffix,
          })
        } else {
          output.push({ entry })
        }
      }
      result.push({
        classes: classNames,
        styles,
        output,
      })
    }

    return result
  }

  /**
   * Parses the content into lines with nodes
   *
   * @param content content to parse
   */
  private parseLines(content: string): ILine[] {
    // lines we return
    const lines: ILine[] = []
    // accumulated nodes for a particular line
    let nodes: IParseNode[] = []

    // start of a particular line
    let lineStartIndex = 0
    // start of plain node content
    let plainNodeStart = unsetValue

    // tells to consider the default logic where we check for plain text etc.,
    let considerDefaultLogic = true

    // stores the command, to match one of the 'supportedCommands'
    let currentCommand = ''
    // helps in finding commands in our format "##[command]" or "[command]"
    let commandSeeker = ''

    // when line ends, this tells if there's any pending node
    let pendingLastNode: number = unsetValue

    const resetCommandVar = () => {
      commandSeeker = ''
      currentCommand = ''
    }

    const resetPlain = () => {
      plainNodeStart = unsetValue
    }

    const resetPending = () => {
      pendingLastNode = unsetValue
    }

    const parseCommandEnd = () => {
      // possible continuation of our well-known commands
      const commandIndex = supportedCommands.indexOf(currentCommand)
      if (commandIndex !== -1) {
        considerDefaultLogic = false
        // we reached the end and found the command
        resetPlain()
        // command is for the whole line, so we are not pushing the node here but defering this to when we find the new line
        pendingLastNode = commandToType[currentCommand]

        if (
          currentCommand === SECTION ||
          currentCommand === GROUP ||
          currentCommand === END_GROUP ||
          currentCommand === COMMAND ||
          currentCommand === ERROR ||
          currentCommand === WARNING ||
          currentCommand === NOTICE
        ) {
          // strip off ##[$(currentCommand)] if there are no timestamps at start
          const possibleTimestamp =
            content.substring(
              lineStartIndex,
              lineStartIndex + TimestampLength
            ) || ''
          if (!possibleTimestamp.match(TimestampRegex)) {
            // ## is optional, so pick the right offfset
            const offset =
              content.substring(lineStartIndex, lineStartIndex + 2) === '##'
                ? 4
                : 2
            lineStartIndex = lineStartIndex + offset + currentCommand.length
          }
        }

        if (currentCommand === GROUP) {
          groupStarted = true
        }

        // group logic- happyCase1: we found endGroup and there's already a group starting
        if (currentCommand === END_GROUP && currentGroupNode) {
          groupEnded = true
        }
      }

      resetCommandVar()
    }

    let groupStarted = false
    let groupEnded = false
    let currentGroupNode: IParseNode | undefined
    let nodeIndex = 0

    for (let index = 0; index < content.length; index++) {
      const char = content.charAt(index)
      // start with considering default logic, individual conditions are responsible to set it false
      considerDefaultLogic = true
      if (char === newLineChar || index === content.length - 1) {
        if (char === commandEnd) {
          parseCommandEnd()
        }

        const node = {
          type: pendingLastNode,
          start: lineStartIndex,
          end: index,
          lineIndex: lines.length,
        } as IParseNode

        let pushNode = false
        // end of the line/text, push any final nodes
        if (pendingLastNode !== NodeType.Plain) {
          // there's pending special node to be pushed
          pushNode = true
          // a new group has just started
          if (groupStarted) {
            currentGroupNode = node
            groupStarted = false
          }
          // a group has ended
          if (groupEnded && currentGroupNode) {
            // this is a throw away node
            pushNode = false
            currentGroupNode.isGroup = true
            // since group has ended, clear all of our pointers
            groupEnded = false
            currentGroupNode = undefined
          }
        } else if (pendingLastNode === NodeType.Plain) {
          // there's pending plain node to be pushed
          pushNode = true
        }

        if (pushNode) {
          node.index = nodeIndex++
          nodes.push(node)
        }

        // A group is pending
        if (currentGroupNode && node !== currentGroupNode) {
          node.group = {
            lineIndex: currentGroupNode.lineIndex,
            nodeIndex: currentGroupNode.index,
          }
        }

        // end of the line, push all nodes that are accumulated till now
        if (nodes.length > 0) {
          lines.push({ nodes })
        }

        // clear node as we are done with the line
        nodes = []
        // increment lineStart for the next line
        lineStartIndex = index + 1
        // unset
        resetPlain()
        resetPending()
        resetCommandVar()

        considerDefaultLogic = false
      } else if (char === hashChar) {
        // possible start of our well-known commands
        if (commandSeeker === '' || commandSeeker === '#') {
          considerDefaultLogic = false
          commandSeeker += hashChar
        }
      } else if (char === commandStart) {
        // possible continuation of our well-known commands
        if (commandSeeker === '##') {
          considerDefaultLogic = false
          commandSeeker += commandStart
        } else if (commandSeeker.length === 0) {
          // covers - "", for live logs, commands will be of [section], with out "##"
          considerDefaultLogic = false
          commandSeeker += commandStart
        }
      } else if (char === commandEnd) {
        if (currentCommand === ICON) {
          const startIndex = index + 1
          let endIndex = startIndex
          for (let i = startIndex; i < content.length; i++) {
            const iconChar = content[i]
            if (iconChar === ' ') {
              endIndex = i
              break
            }
          }
          nodes.push({
            type: NodeType.Icon,
            lineIndex: lines.length,
            start: startIndex,
            end: endIndex,
            index: nodeIndex++,
          })
          // jump to post Icon content
          index = endIndex + 1
          lineStartIndex = index
          continue
        } else {
          parseCommandEnd()
        }
      }

      if (considerDefaultLogic) {
        if (commandSeeker === '##[' || commandSeeker === '[') {
          // it's possible that we are parsing a command
          currentCommand += char.toLowerCase()
        }

        if (currentCommand.length > maxCommandLength) {
          // to avoid accumulating command unncessarily, let's check max length, if it exceeds, it's not a command
          resetCommandVar()
        }

        // considering as plain text
        if (plainNodeStart === unsetValue) {
          // we didn't set this yet, set now
          plainNodeStart = lineStartIndex
          // set pending node if there isn't one pending
          if (pendingLastNode === unsetValue) {
            pendingLastNode = NodeType.Plain
          }
        }
      }
    }

    return lines
  }

  /**
   * Parses the content into ANSII states
   *
   * @param content content to parse
   */
  private getStates(content: string): IAnsiEscapeCodeState[] {
    const result: IAnsiEscapeCodeState[] = []
    // Eg: "ESC[0KESC[33;1mWorker informationESC[0m
    if (!_ansiEscapeCodeRegex.test(content)) {
      // Not of interest, don't touch content
      return [
        {
          output: content,
        },
      ]
    }

    let command = ''
    let currentText = ''
    let code = ''
    let state = {} as IAnsiEscapeCodeState
    let isCommandActive = false
    let codes = []
    for (let index = 0; index < content.length; index++) {
      const character = content[index]
      if (isCommandActive) {
        if (character === ';') {
          if (code) {
            codes.push(code)
            code = ''
          }
        } else if (character === 'm') {
          if (code) {
            isCommandActive = false
            // done
            codes.push(code)
            state.style = state.style || ({} as IStyle)

            let setForeground = false
            let setBackground = false
            let isSingleColorCode = false
            let isRGBColorCode = false
            const rgbColors: number[] = []

            for (const currentCode of codes) {
              const style = state.style as IStyle
              const codeNumber = parseInt(currentCode)
              if (setForeground && isSingleColorCode) {
                // set foreground color using 8-bit (256 color) palette - Esc[ 38:5:<n> m
                if (codeNumber >= 0 && codeNumber < 16) {
                  style.fg = this._get8BitColorClasses(codeNumber)
                } else if (codeNumber >= 16 && codeNumber < 256) {
                  style.fg = this._get8BitRGBColors(codeNumber)
                  style.isFgRGB = true
                }
                setForeground = false
                isSingleColorCode = false
              } else if (setForeground && isRGBColorCode) {
                // set foreground color using 24-bit (true color) palette - Esc[ 38:2:<r>:<g>:<b> m
                if (codeNumber >= 0 && codeNumber < 256) {
                  rgbColors.push(codeNumber)
                  if (rgbColors.length === 3) {
                    style.fg = `${rgbColors[0]},${rgbColors[1]},${rgbColors[2]}`
                    style.isFgRGB = true
                    rgbColors.length = 0 // clear array
                    setForeground = false
                    isRGBColorCode = false
                  }
                }
              } else if (setBackground && isSingleColorCode) {
                // set background color using 8-bit (256 color) palette - Esc[ 48:5:<n> m
                if (codeNumber >= 0 && codeNumber < 16) {
                  style.bg = this._get8BitColorClasses(codeNumber)
                } else if (codeNumber >= 16 && codeNumber < 256) {
                  style.bg = this._get8BitRGBColors(codeNumber)
                  style.isBgRGB = true
                }
                setBackground = false
                isSingleColorCode = false
              } else if (setBackground && isRGBColorCode) {
                // set background color using 24-bit (true color) palette - Esc[ 48:2:<r>:<g>:<b> m
                if (codeNumber >= 0 && codeNumber < 256) {
                  rgbColors.push(codeNumber)
                  if (rgbColors.length === 3) {
                    style.bg = `${rgbColors[0]},${rgbColors[1]},${rgbColors[2]}`
                    style.isBgRGB = true
                    rgbColors.length = 0 // clear array
                    setBackground = false
                    isRGBColorCode = false
                  }
                }
              } else if (setForeground || setBackground) {
                if (codeNumber === 5) {
                  isSingleColorCode = true
                } else if (codeNumber === 2) {
                  isRGBColorCode = true
                }
              } else if (fgColors[currentCode]) {
                style.fg = fgColors[currentCode]
              } else if (bgColors[currentCode]) {
                style.bg = bgColors[currentCode]
              } else if (currentCode === Resets.Reset) {
                // reset
                state.style = {} as IStyle
              } else if (currentCode === Resets.Set_Bg) {
                setBackground = true
              } else if (currentCode === Resets.Set_Fg) {
                setForeground = true
              } else if (currentCode === Resets.Default_Fg) {
                style.fg = ''
              } else if (currentCode === Resets.Default_Bg) {
                style.bg = ''
              } else if (codeNumber >= 91 && codeNumber <= 97) {
                style.fg = fgColors[codeNumber - 60] + BrightClassPostfix
              } else if (codeNumber >= 101 && codeNumber <= 107) {
                style.bg = bgColors[codeNumber - 60] + BrightClassPostfix
              } else if (specials[currentCode]) {
                style[specials[currentCode]] = true
              } else if (currentCode === Resets.Bold) {
                style.bold = false
              } else if (currentCode === Resets.Italic) {
                style.italic = false
              } else if (currentCode === Resets.Underline) {
                style.underline = false
              }
            }

            // clear
            command = ''
            currentText = ''
            code = ''
          } else {
            // To handle ESC[m, we should just ignore them
            isCommandActive = false
            command = ''
            state.style = {} as IStyle
          }

          codes = []
        } else if (isNaN(parseInt(character))) {
          // if this is not a number, eg: 0K, this isn't something we support
          code = ''
          isCommandActive = false
          command = ''
        } else if (code.length === 4) {
          // we probably got code that we don't support, ignore
          code = ''
          isCommandActive = false
          if (character !== ESC) {
            // if this is not an ESC, let's not consider command from now on
            // eg: ESC[0Ksometexthere, at this point, code would be 0K, character would be 's'
            command = ''
            currentText += character
          }
        } else {
          code += character
        }

        continue
      } else if (command) {
        if (command === ESC && character === '[') {
          isCommandActive = true
          // push state
          if (currentText) {
            state.output = currentText
            result.push(state)
            // deep copy exisiting style for the line to preserve different styles between commands
            let previousStyle
            if (state.style) {
              previousStyle = Object.assign({}, state.style)
            }
            state = {} as IAnsiEscapeCodeState
            if (previousStyle) {
              state.style = previousStyle
            }
            currentText = ''
          }
        }

        continue
      }

      if (character === ESC) {
        command = character
      } else {
        currentText += character
      }
    }

    // still pending text
    if (currentText) {
      state.output = currentText + (command ? command : '')
      result.push(state)
    }

    return result
  }

  /**
   * With 8 bit colors, from 16-256, rgb color combinations are used
   * 16-231 (216 colors) is a 6 x 6 x 6 color cube
   * 232 - 256 are grayscale colors
   *
   * @param codeNumber 16-256 number
   */
  private _get8BitRGBColors(codeNumber: number): string {
    let rgbColor: IRGBColor
    if (codeNumber < 232) {
      rgbColor = this._get216Color(codeNumber - 16)
    } else {
      rgbColor = this._get8bitGrayscale(codeNumber - 232)
    }
    return `${rgbColor.r},${rgbColor.g},${rgbColor.b}`
  }

  /**
   * With 8 bit color, from 0-15, css classes are used to represent customer colors
   *
   * @param codeNumber 0-15 number that indicates the standard or high intensity color code that should be used
   */
  private _get8BitColorClasses(codeNumber: number): string {
    let colorClass = ''
    if (codeNumber < 8) {
      colorClass = `${base8BitColors[codeNumber]}`
    } else {
      colorClass = `${base8BitColors[codeNumber - 8] + BrightClassPostfix}`
    }
    return colorClass
  }

  /**
   * 6 x 6 x 6 (216 colors) rgb color generator
   * https://en.wikipedia.org/wiki/Web_colors#Web-safe_colors
   *
   * @param increment 0-215 value
   */
  private _get216Color(increment: number): IRGBColor {
    return {
      r: colorIncrements216[Math.floor(increment / 36)],
      g: colorIncrements216[Math.floor(increment / 6) % 6],
      b: colorIncrements216[increment % 6],
    }
  }

  /**
   * Grayscale from black to white in 24 steps. The first value of 0 represents rgb(8,8,8) while the last value represents rgb(238,238,238)
   *
   * @param increment 0-23 value
   */
  private _get8bitGrayscale(increment: number): IRGBColor {
    const colorCode = increment * 10 + 8
    return {
      r: colorCode,
      g: colorCode,
      b: colorCode,
    }
  }
}
