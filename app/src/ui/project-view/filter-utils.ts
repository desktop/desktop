import { IAPIProjectV2ItemWithContent, IAPIProjectField } from '../../lib/api'

interface FilterCondition {
  field: string
  value: string
  negate: boolean
}

interface FilterOptions {
  currentUserLogin?: string
  projectFields?: ReadonlyArray<IAPIProjectField>
}

/**
 * Find the current iteration from the project's iteration field.
 * Returns the title of the current iteration, or null if not found.
 */
export function findCurrentIterationTitle(fields: ReadonlyArray<IAPIProjectField>): string | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (const field of fields) {
    if (field.dataType === 'ITERATION' && field.configuration) {
      const allIterations = [
        ...field.configuration.iterations,
        ...field.configuration.completedIterations,
      ]

      for (const iteration of allIterations) {
        const startDate = new Date(iteration.startDate)
        startDate.setHours(0, 0, 0, 0)
        // Duration is in days
        const endDate = new Date(startDate)
        endDate.setDate(endDate.getDate() + iteration.duration)

        if (today >= startDate && today < endDate) {
          return iteration.title
        }
      }
    }
  }

  return null
}

/**
 * Parse a GitHub Projects filter string into individual conditions.
 * Supports syntax like:
 * - status:Done
 * - assignee:username
 * - label:bug
 * - -status:Backlog (negation)
 * - status:"In Progress" (quoted values)
 * - is:open, is:closed
 */
export function parseFilter(filter: string): FilterCondition[] {
  if (!filter || !filter.trim()) {
    return []
  }

  const conditions: FilterCondition[] = []
  // Match patterns like: -?field:"value with spaces" or -?field:value
  const regex = /(-?)(\w+):(?:"([^"]+)"|(\S+))/g
  let match

  while ((match = regex.exec(filter)) !== null) {
    const negate = match[1] === '-'
    const field = match[2].toLowerCase()
    const value = match[3] || match[4] // quoted or unquoted value

    conditions.push({ field, value, negate })
  }

  return conditions
}

/**
 * Get a field value from an item by field name.
 */
function getFieldValue(
  item: IAPIProjectV2ItemWithContent,
  fieldName: string
): string | null {
  const fieldValue = item.fieldValues.find(
    fv => fv.field.name.toLowerCase() === fieldName.toLowerCase()
  )

  if (!fieldValue) {
    return null
  }

  switch (fieldValue.type) {
    case 'singleSelect':
      return fieldValue.name || null
    case 'text':
      return fieldValue.text || null
    case 'number':
      return fieldValue.number?.toString() || null
    case 'date':
      return fieldValue.date || null
    default:
      return null
  }
}

/**
 * Check if an item matches a single filter condition.
 */
function matchesCondition(
  item: IAPIProjectV2ItemWithContent,
  condition: FilterCondition,
  options: FilterOptions
): boolean {
  const { field, value, negate } = condition
  let matches = false

  switch (field) {
    case 'status': {
      const statusValue = getFieldValue(item, 'Status')
      matches = statusValue?.toLowerCase() === value.toLowerCase()
      break
    }

    case 'assignee': {
      const content = item.content
      if (content && content.assignees) {
        // Handle @me by using the current user's login
        const targetLogin = value === '@me' ? options.currentUserLogin : value
        if (targetLogin) {
          matches = content.assignees.some(
            a => a.login.toLowerCase() === targetLogin.toLowerCase()
          )
        }
      }
      break
    }

    case 'label': {
      const content = item.content
      if (content && content.labels) {
        matches = content.labels.some(
          l => l.name.toLowerCase() === value.toLowerCase()
        )
      }
      break
    }

    case 'is': {
      const content = item.content
      if (content) {
        if (value === 'open') {
          matches = content.state === 'OPEN'
        } else if (value === 'closed') {
          matches = content.state === 'CLOSED'
        } else if (value === 'merged') {
          matches = content.state === 'MERGED'
        } else if (value === 'issue') {
          matches = content.type === 'Issue'
        } else if (value === 'pr' || value === 'pullrequest') {
          matches = content.type === 'PullRequest'
        } else if (value === 'draft') {
          matches = content.type === 'DraftIssue'
        }
      }
      break
    }

    case 'type': {
      const content = item.content
      const lowerValue = value.toLowerCase()
      // First check if it's a known content type
      if (lowerValue === 'issue') {
        matches = content?.type === 'Issue'
      } else if (lowerValue === 'pr' || lowerValue === 'pullrequest') {
        matches = content?.type === 'PullRequest'
      } else if (lowerValue === 'draft') {
        matches = content?.type === 'DraftIssue'
      } else {
        // Check GitHub Issue Types (e.g., type:Bug, type:Feature)
        if (content?.issueType?.name) {
          matches = content.issueType.name.toLowerCase() === lowerValue
        } else {
          // Fall back to checking custom field named "Type"
          const fieldValue = getFieldValue(item, 'Type')
          if (fieldValue !== null) {
            matches = fieldValue.toLowerCase() === lowerValue
          }
        }
      }
      break
    }

    case 'repo':
    case 'repository': {
      const content = item.content
      if (content && content.repository) {
        const repoName = `${content.repository.owner.login}/${content.repository.name}`
        matches = repoName.toLowerCase().includes(value.toLowerCase()) ||
                  content.repository.name.toLowerCase() === value.toLowerCase()
      }
      break
    }

    case 'no': {
      // Handle "no:status", "no:assignee", etc.
      if (value === 'status') {
        matches = getFieldValue(item, 'Status') === null
      } else if (value === 'assignee') {
        matches = !item.content?.assignees || item.content.assignees.length === 0
      } else if (value === 'label') {
        matches = !item.content?.labels || item.content.labels.length === 0
      }
      break
    }

    case 'iteration': {
      // Get the item's iteration value
      const iterationValue = item.fieldValues.find(
        fv => fv.type === 'iteration' && fv.field.name.toLowerCase() === 'iteration'
      )

      if (value === '@current') {
        // Find the current iteration from project fields
        if (options.projectFields) {
          const currentIterationTitle = findCurrentIterationTitle(options.projectFields)
          if (currentIterationTitle && iterationValue && iterationValue.type === 'iteration') {
            matches = iterationValue.title.toLowerCase() === currentIterationTitle.toLowerCase()
          }
        }
      } else {
        // Direct comparison with iteration title
        if (iterationValue && iterationValue.type === 'iteration') {
          matches = iterationValue.title.toLowerCase() === value.toLowerCase()
        }
      }
      break
    }

    default: {
      // Try to match against custom fields
      const fieldValue = getFieldValue(item, field)
      if (fieldValue !== null) {
        matches = fieldValue.toLowerCase() === value.toLowerCase()
      }
      break
    }
  }

  return negate ? !matches : matches
}

/**
 * Apply a filter string to a list of items.
 * All conditions must match (AND logic).
 */
export function applyFilter(
  items: ReadonlyArray<IAPIProjectV2ItemWithContent>,
  filter: string | undefined,
  options: FilterOptions = {}
): ReadonlyArray<IAPIProjectV2ItemWithContent> {
  if (!filter || !filter.trim()) {
    return items
  }

  const conditions = parseFilter(filter)
  if (conditions.length === 0) {
    return items
  }

  const filtered = items.filter(item =>
    conditions.every(condition => matchesCondition(item, condition, options))
  )

  return filtered
}
