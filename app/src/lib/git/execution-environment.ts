import type { IGitExecutionOptions } from './core'
import { createRepositoryOperationContext } from './repository-operation-context'

const localEnvironments =
  createRepositoryOperationContext<
    Readonly<Record<string, string | undefined>>
  >()

/**
 * Run local-only Git work without application credential or hook services.
 *
 * This changes host environment provisioning, not Git execution, ownership
 * fences, snapshot validation, or error handling. Hooks cannot be intercepted.
 */
export function withLocalGitEnvironment<T>(
  environment: Readonly<Record<string, string | undefined>>,
  operation: () => Promise<T>
): Promise<T> {
  return localEnvironments.run({ ...environment }, operation)
}

/** Get local host overrides for Git calls that must bypass application services. */
export function getLocalGitEnvironment():
  | Readonly<Record<string, string | undefined>>
  | undefined {
  return localEnvironments.getStore()
}

/** Provision application services lazily, or use an explicit local-only host. */
export async function withGitExecutionEnvironment<T>(
  operation: (environment: Record<string, string | undefined>) => Promise<T>,
  path: string,
  options?: IGitExecutionOptions
): Promise<T> {
  const local = getLocalGitEnvironment()
  if (local !== undefined) {
    if (options?.interceptHooks || options?.fallbackAccount !== undefined) {
      throw new Error(
        'Local-only Git cannot request application hooks or credentials'
      )
    }
    return operation({ ...local, ...options?.env })
  }
  const [{ withHooksEnv }, { withTrampolineEnv }] = await Promise.all([
    import('../hooks/with-hooks-env'),
    import('../trampoline/trampoline-environment'),
  ])
  return withHooksEnv(
    hooksEnv =>
      withTrampolineEnv(
        environment => operation({ ...hooksEnv, ...environment }),
        path,
        options?.isBackgroundTask ?? false,
        hooksEnv,
        options?.fallbackAccount
      ),
    path,
    options
  )
}
