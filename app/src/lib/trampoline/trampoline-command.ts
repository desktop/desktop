export interface ITrampolineCommand {
  readonly identifier: string
  readonly parameters: ReadonlyArray<string>
  readonly environmentVariables: ReadonlyMap<string, string>
}

export type TrampolineCommandHandler = (
  command: ITrampolineCommand
) => Promise<string | undefined>
