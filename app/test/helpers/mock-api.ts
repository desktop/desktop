import { API, IAPIRepository, IAPIIdentity, IAPIEmail } from '../../src/lib/api'

/**
 * A partial record of API method overrides.
 * Each key is a public async method name on API, mapped to a
 * replacement implementation.
 */
type APIMethodOverrides = {
  [K in keyof API]?: API[K]
}

/**
 * Creates a mock API instance with sensible defaults that return empty/null
 * results. Override specific methods by passing an overrides object.
 *
 * @example
 * ```ts
 * const api = createMockAPI({
 *   fetchRepository: async () => mockRepo,
 *   fetchEmails: async () => [{ email: 'a@b.com', primary: true, verified: true, visibility: 'public' }],
 * })
 * ```
 */
export function createMockAPI(overrides: APIMethodOverrides = {}): API {
  const api = new API('https://api.github.com', 'mock-token-for-testing')
  const mockedMethods = new Set(Object.keys(overrides))

  for (const [method, impl] of Object.entries(overrides)) {
    ;(api as any)[method] = impl
  }

  return new Proxy(api, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)

      if (
        typeof property !== 'string' ||
        typeof value !== 'function' ||
        mockedMethods.has(property)
      ) {
        return value
      }

      return () =>
        Promise.reject(
          new Error(`No mock implementation registered for API.${property}`)
        )
    },
  })
}

/**
 * Creates a mock IAPIRepository with sensible defaults.
 */
export function createMockAPIRepository(
  overrides: Partial<IAPIRepository> = {}
): IAPIRepository {
  return {
    clone_url: 'https://github.com/owner/repo.git',
    ssh_url: 'git@github.com:owner/repo.git',
    html_url: 'https://github.com/owner/repo',
    name: 'repo',
    owner: createMockAPIIdentity(),
    private: false,
    fork: false,
    default_branch: 'main',
    pushed_at: '2025-01-01T00:00:00Z',
    has_issues: true,
    archived: false,
    ...overrides,
  }
}

/**
 * Creates a mock IAPIIdentity with sensible defaults.
 */
export function createMockAPIIdentity(
  overrides: Partial<IAPIIdentity> = {}
): IAPIIdentity {
  return {
    id: 1,
    login: 'octocat',
    avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
    html_url: 'https://github.com/octocat',
    type: 'User',
    ...overrides,
  }
}

/**
 * Creates a mock IAPIEmail.
 */
export function createMockAPIEmail(
  email = 'user@example.com',
  overrides: Partial<IAPIEmail> = {}
): IAPIEmail {
  return {
    email,
    primary: true,
    verified: true,
    visibility: 'public',
    ...overrides,
  }
}
