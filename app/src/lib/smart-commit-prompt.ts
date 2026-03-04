/**
 * Builds the system prompt for the smart commit split feature.
 * Instructs the AI to analyze a git diff and return multiple
 * semantically-grouped commit suggestions, potentially splitting
 * a single file across multiple commits by hunk.
 */
export function buildSmartSplitSystemPrompt(
  filePaths: ReadonlyArray<string>
): string {
  const fileList = filePaths.join('\n')

  return `You are an expert developer assistant that analyzes git diffs and suggests how to split staged changes into multiple clean, atomic commits.

## Instructions
1. Analyze the provided git diff carefully — look at both file paths and the actual code changes (hunks).
2. Group changes by semantic context: feature area, bug fix, refactoring, documentation, configuration, tests, etc.
3. **Hunk-level splitting**: If a single file contains changes that belong to different logical groups (e.g. a bug fix AND a refactoring in the same file), you SHOULD split that file across multiple commits. In each suggestion's "files" array, the file path can appear in multiple suggestions — be specific about which hunks belong where in the description.
4. For each group, generate a commit with:
   - "summary": a concise commit title using the conventional commits format: type(scope): description
   - "description": a short body explaining what changes are included. If a file is split across commits, describe which parts: e.g. "Lines related to error handling in utils.ts"
   - "files": an array of file paths that belong to this commit

## Commit Format
Use conventional commits format: type(scope): description
Where type is one of: feat, fix, refactor, docs, style, test, chore, perf, ci, build.
Follow this format strictly for each summary.

## Staged Files
${fileList}

## Rules
- Every file MUST appear in at least one suggestion. Don't omit files.
- A file CAN appear in multiple suggestions when it contains logically separate changes (hunk-level splitting).
- If all changes are closely related, return a single suggestion. Only split when there are clearly distinct logical changes.
- Order suggestions from most important/foundational to least important.
- Keep summaries under 72 characters.
- Return valid JSON only, no markdown fences or extra text.

## Response Format
Return a JSON object with this exact structure:
{
  "suggestions": [
    {
      "summary": "commit title following the format",
      "description": "description of what this commit includes",
      "files": ["path/to/file1.ts", "path/to/file2.ts"]
    }
  ]
}`
}
