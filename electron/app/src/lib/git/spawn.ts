import { spawn, IGitSpawnOptions } from 'dugite'
import * as GitPerf from '../../ui/lib/git-perf'
import { withTrampolineEnv } from '../trampoline/trampoline-environment'

type SpawnOptions = IGitSpawnOptions & {
  /**
   * Whether the command about to run is part of a background task or not.
   * This affects error handling and UI such as credential prompts.
   */
  readonly isBackgroundTask?: boolean
}

/**
 * Spawn a Git process, deferring all processing work to the caller.
 *
 * @param args Array of strings to pass to the Git executable.
 * @param path The path to execute the command from.
 * @param name The name of the operation - for tracing purposes.
 * @param successExitCodes An optional array of exit codes that indicate success.
 */
export const spawnGit = (
  args: string[],
  path: string,
  name: string,
  options?: SpawnOptions
) =>
  withTrampolineEnv(
    trampolineEnv =>
      GitPerf.measure(`${name}: git ${args.join(' ')}`, async () =>
        spawn(args, path, {
          ...options,
          env: { ...options?.env, ...trampolineEnv },
        })
      ),
    path,
    options?.isBackgroundTask ?? false,
    options?.env
  )
