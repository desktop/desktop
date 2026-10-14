/**
 * Keep the environment supplied by Git, removing only Desktop's interception
 * settings. In particular, preserve Git configuration and credential helpers.
 */
export function getInheritedHookEnv(
  proxyEnv: Record<string, string>,
  hooksPathConfig: string
): Record<string, string> {
  const env = { ...proxyEnv }

  // Remove our exact override, not all GIT_CONFIG_PARAMETERS: the remaining
  // entries may include the real hooks path, -c options, and Desktop credentials.
  if (env.GIT_CONFIG_PARAMETERS !== undefined) {
    env.GIT_CONFIG_PARAMETERS = env.GIT_CONFIG_PARAMETERS.replace(
      hooksPathConfig,
      ''
    ).trim()
  }

  delete env.PROCESS_PROXY_PORT
  delete env.PROCESS_PROXY_TOKEN
  return env
}
