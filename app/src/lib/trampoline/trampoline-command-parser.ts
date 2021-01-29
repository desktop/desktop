import { parseEnumValue } from '../enum'
import {
  ITrampolineCommand,
  TrampolineCommandIdentifier,
} from './trampoline-command'

enum TrampolineCommandParserState {
  ParameterCount,
  Parameters,
  EnvironmentVariablesCount,
  EnvironmentVariables,
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
          this.state = TrampolineCommandParserState.Finished
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
          this.state = TrampolineCommandParserState.Finished
        }
        break

      default:
        throw new Error(`Received value during invalid state: ${this.state}`)
    }
  }

  /**
   * Returns a command.
   *
   * Throws an error if the parser hasn't finished yet, or if the identifier
   * is missing or invalid.
   **/
  public toCommand(): ITrampolineCommand {
    if (this.hasFinished() === false) {
      throw new Error(
        'The command cannot be generated if parsing is not finished'
      )
    }

    const identifierString = this.environmentVariables.get(
      'DESKTOP_TRAMPOLINE_IDENTIFIER'
    )

    if (identifierString === undefined) {
      throw new Error('The command identifier is missing')
    }

    const identifier = parseEnumValue(
      TrampolineCommandIdentifier,
      identifierString
    )

    if (identifier === undefined) {
      throw new Error(
        `The command identifier ${identifierString} is not supported`
      )
    }

    return {
      identifier,
      parameters: this.parameters,
      environmentVariables: this.environmentVariables,
    }
  }
}
