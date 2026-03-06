/**
 * Custom format configuration for commit messages.
 */
export interface ICommitFormatConfig {
  /** The format template, e.g. "dev/fix/chore(feature) : description" */
  readonly template: string
}

/**
 * Builds the system prompt for the smart commit split feature.
 * Instructs the AI to analyze a git diff and return multiple
 * semantically-grouped commit suggestions, potentially splitting
 * a single file across multiple commits by hunk.
 */
export function buildSmartSplitSystemPrompt(
  filePaths: ReadonlyArray<string>,
  formatConfig?: ICommitFormatConfig
): string {
  const fileList = filePaths.join('\n')

  const commitFormatSection =
    formatConfig && formatConfig.template.trim().length > 0
      ? buildCustomFormatSection(formatConfig)
      : buildDefaultFormatSection()

  return `You are an expert developer assistant. Your job is to analyze a git diff and split the staged changes into clean, atomic, logically coherent commits — even when all changes are in a single file.

## How to analyze

1. **Read every hunk carefully.** Look at what each hunk actually changes: is it adding a feature? fixing a bug? renaming variables? updating imports? changing comments or docs? adjusting config?
2. **Group hunks by purpose, not by file.** A single file often contains multiple unrelated changes. For example, one hunk might add an event handler (feat), while another hunk in the same file fixes a typo in a comment (docs). These MUST be separate commits.
3. **Identify logical units of work.** A logical commit is a set of hunks (possibly across multiple files) that together accomplish one goal. Typical categories:
   - Adding a new feature or capability
   - Fixing a bug or correcting wrong behavior
   - Refactoring (renaming, restructuring, extracting functions) with no behavior change
   - Updating types, interfaces, or models
   - Adding or updating tests
   - Documentation / comment changes
   - Style changes (formatting, whitespace, import ordering)
   - Configuration / build / CI changes
   - Cleanup (removing dead code, unused imports)
4. **Do not over-split.** If two hunks in the same file are part of the same logical change (e.g., adding a function + calling it elsewhere in the same file), keep them in one commit.
5. **Do not under-split.** If a file has changes that serve clearly different purposes, split them into separate commits even if the file appears in both.

## Single-file rule

Each file MUST appear in exactly ONE suggestion. Do NOT put the same file in multiple commits.
If a file contains multiple logical changes, group them into the commit that best represents the dominant purpose of the changes in that file.
Mention in the description which secondary changes are also included (e.g., "Also includes minor refactor of X").

When there is only one file, return a single suggestion containing all changes to that file.

${commitFormatSection}

## Ordering

Order commits from most foundational to least — e.g., types/models first, then implementation, then tests, then docs.

## Staged files (${filePaths.length} files — ALL must appear)
${fileList}

## Output rules

- **CRITICAL: You have ${filePaths.length} staged files. The union of ALL "files" arrays in your response MUST contain exactly these ${filePaths.length} files. No file may be omitted.**
- Every staged file MUST appear in exactly one suggestion.
- A file MUST NOT appear in multiple suggestions.
- Only return a single suggestion if ALL changes in the diff are tightly related to one goal.
- Be deterministic: given the same diff, the split should be the same. Focus on what the code does, not on arbitrary groupings.
- Return valid JSON only, no markdown fences, no extra text.

## Response format
{
  "suggestions": [
    {
      "summary": "commit title following the format above",
      "description": "Explain which changes are included. Reference function names or what the hunks do.",
      "files": ["path/to/file.ts"]
    }
  ]
}`
}

function buildDefaultFormatSection(): string {
  return `## Commit format

Use conventional commits: type(scope): description  
Types: feat, fix, refactor, docs, style, test, chore, perf, ci, build  
Keep summaries under 72 characters.  
The description field should explain what specific hunks/changes are included (especially when a file is split across commits).`
}

/**
 * Analyzes a format template and generates a structural description
 * that the AI can follow precisely.
 */
function analyzeTemplate(template: string): string {
  const t = template.trim()
  const lines: Array<string> = []

  // Detect segments: identify each chunk of the template
  // e.g. "dev/fix/chore(feature) : description" has:
  //   - "dev/fix/chore" → options block (pick one)
  //   - "(feature)"    → parenthesized placeholder
  //   - " : "          → literal separator
  //   - "description"  → placeholder

  // Detect option groups (words separated by /)
  const optionPattern = /\b(\w+(?:\/\w+){1,})\b/g
  let match: RegExpExecArray | null
  const options: Array<string> = []
  while ((match = optionPattern.exec(t)) !== null) {
    options.push(match[1])
  }

  if (options.length > 0) {
    for (const opt of options) {
      const choices = opt.split('/')
      lines.push(
        `- \`${opt}\` is a set of options — pick exactly ONE: ${choices
          .map(c => `\`${c}\``)
          .join(', ')}`
      )
    }
  }

  // Detect bracketed segments [xxx]
  const bracketPattern = /\[([^\]]+)\]/g
  while ((match = bracketPattern.exec(t)) !== null) {
    lines.push(
      `- \`[${match[1]}]\` — keep the brackets \`[]\`, replace the content inside`
    )
  }

  // Detect parenthesized segments (xxx)
  const parenPattern = /\(([^)]+)\)/g
  while ((match = parenPattern.exec(t)) !== null) {
    lines.push(
      `- \`(${match[1]})\` — keep the parentheses \`()\`, replace the content inside`
    )
  }

  // Detect literal separators (: - — etc.)
  if (t.includes(' : ')) {
    lines.push(
      '- ` : ` (space-colon-space) is a literal separator — keep it exactly'
    )
  } else if (t.includes(': ')) {
    lines.push('- `: ` (colon-space) is a literal separator — keep it exactly')
  }
  if (/ - /.test(t)) {
    lines.push(
      '- ` - ` (space-dash-space) is a literal separator — keep it exactly'
    )
  }

  return lines.join('\n')
}

function buildCustomFormatSection(config: ICommitFormatConfig): string {
  const template = config.template.trim()
  const analysis = analyzeTemplate(template)

  const lines: Array<string> = []

  lines.push('## Commit format')
  lines.push('')
  lines.push(
    'The user has defined a CUSTOM commit format. You MUST follow it STRICTLY for EVERY commit summary.'
  )
  lines.push('')
  lines.push('### Template')
  lines.push('```')
  lines.push(template)
  lines.push('```')

  if (analysis.length > 0) {
    lines.push('')
    lines.push('### Structure analysis')
    lines.push(analysis)
  }

  lines.push('')
  lines.push('### Rules')
  lines.push('')
  lines.push(
    '1. **Your output MUST have the EXACT same syntactic structure as the template.** Same delimiters, same positions, same punctuation. Character for character. If the template has no brackets `[]`, your output has no brackets. If the template uses parentheses `()`, your output uses parentheses.'
  )
  lines.push(
    '2. **Options separated by `/`**: pick exactly ONE word from the list. Do NOT wrap it in extra delimiters.'
  )
  lines.push(
    '3. **Placeholders** (any descriptive word like `feature`, `description`, `scope`, `name`): replace with an actual value from the code changes.'
  )
  lines.push(
    '4. **Never invent new delimiters.** Output only the exact delimiters present in the template — nothing more, nothing less.'
  )
  lines.push(
    '5. **Every segment of the template must appear in your output.** Never skip, merge, or reorder segments.'
  )
  lines.push('6. Keep summaries under 72 characters.')
  lines.push(
    '7. The description field in the JSON should explain what specific hunks/changes are included.'
  )

  return lines.join('\n')
}
