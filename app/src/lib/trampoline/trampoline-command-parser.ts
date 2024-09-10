import { parseEnumValue } from '../enum'
import { assertNever } from '../fatal-error'
import { sendNonFatalException } from '../helpers/non-fatal-exception'
import {
  ITrampolineCommand,
  TrampolineCommandIdentifier,
} from './trampoline-command'

enum TrampolineCommandParserState {
  ParameterCount,
  Parameters,
  EnvironmentVariablesCount,
  EnvironmentVariables,
  Stdin,
  Finished,
}

/**
 * The purpose of this class is to process the data received from the trampoline
 * client and build a command from it.
 */
export class TrampolineCommandParser {
  private parameterCount: number = 0
  private readonly parameters: string[] = []
  private environmentVariablesCount: number = 0
  private readonly environmentVariables = new Map<string, string>()
  private stdin = ''

  private state: TrampolineCommandParserState =
    TrampolineCommandParserState.ParameterCount

  /** Whether or not it has finished parsing the command. */
  public hasFinished() {
    return this.state === TrampolineCommandParserState.Finished
  }

  /**
   * Takes a chunk of data and processes it depending on the current state.
   *
   * Throws an error if it's invoked after the parser has finished, or if
   * anything unexpected is received.
   **/
  public processValue(value: string) {
    switch (this.state) {
      case TrampolineCommandParserState.ParameterCount:
        this.parameterCount = parseInt(value)

        if (this.parameterCount > 0) {
          this.state = TrampolineCommandParserState.Parameters
        } else {
          this.state = TrampolineCommandParserState.EnvironmentVariablesCount
        }

        break

      case TrampolineCommandParserState.Parameters:
        this.parameters.push(value)
        if (this.parameters.length === this.parameterCount) {
          this.state = TrampolineCommandParserState.EnvironmentVariablesCount
        }
        break

      case TrampolineCommandParserState.EnvironmentVariablesCount:
        this.environmentVariablesCount = parseInt(value)

        if (this.environmentVariablesCount > 0) {
          this.state = TrampolineCommandParserState.EnvironmentVariables
        } else {
          this.state = TrampolineCommandParserState.Stdin
        }

        break

      case TrampolineCommandParserState.EnvironmentVariables:
        // Split after the first '='
        const match = /([^=]+)=(.*)/.exec(value)

        if (
          match === null ||
          // Length must be 3: the 2 groups + the whole string
          match.length !== 3
        ) {
          throw new Error(`Unexpected environment variable format: ${value}`)
        }

        const variableKey = match[1]
        const variableValue = match[2]

        this.environmentVariables.set(variableKey, variableValue)

        if (this.environmentVariables.size === this.environmentVariablesCount) {
          this.state = TrampolineCommandParserState.Stdin
        }
        break
      case TrampolineCommandParserState.Stdin:
        this.stdin = value
        this.state = TrampolineCommandParserState.Finished
        break
      case TrampolineCommandParserState.Finished:
        throw new Error(`Received value when in Finished`)
      default:
        assertNever(this.state, `Invalid state: ${this.state}`)
    }
  }

  /**
   * Returns a command.
   *
   * It will return null if the parser hasn't finished yet, or if the identifier
   * is missing or invalid.
   **/
  public toCommand(): ITrampolineCommand | null {
    if (this.hasFinished() === false) {
      const error = new Error(
        'The command cannot be generated if parsing is not finished'
      )
      this.logCommandCreationError(error)
      return null
    }

    const identifierString = this.environmentVariables.get(
      'DESKTOP_TRAMPOLINE_IDENTIFIER'
    )

    if (identifierString === undefined) {
      const error = new Error(
        `The command identifier is missing. Env variables received: ${Array.from(
          this.environmentVariables.keys()
        )}`
      )
      this.logCommandCreationError(error)
      return null
    }

    const identifier = parseEnumValue(
      TrampolineCommandIdentifier,
      identifierString
    )

    if (identifier === undefined) {
      const error = new Error(
        `The command identifier ${identifierString} is not supported`
      )
      this.logCommandCreationError(error)
      return null
    }

    const trampolineToken = this.environmentVariables.get(
      'DESKTOP_TRAMPOLINE_TOKEN'
    )

    if (trampolineToken === undefined) {
      const error = new Error(`The trampoline token is missing`)
      this.logCommandCreationError(error)
      return null
    }

    return {
      identifier,
      trampolineToken,
      parameters: this.parameters,
      environmentVariables: this.environmentVariables,
      stdin: this.stdin,
    }
  }

  private logCommandCreationError(error: Error) {
    log.error('Error creating trampoline command:', error)
    sendNonFatalException('trampolineCommandParser', error)
  }
}
