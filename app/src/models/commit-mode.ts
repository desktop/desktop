/**
 * How the user wants to create commits in a repository.
 *
 * The stored preference is independent of whether assisted commits are
 * currently available. Unsupported contexts continue to use manual commits.
 */
export type CommitMode = 'manual' | 'copilot'
