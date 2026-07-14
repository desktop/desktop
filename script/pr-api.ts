import { execSync } from 'child_process'

export interface IAPIPR {
  readonly title: string
  readonly body: string
  readonly headRefName: string
  readonly url: string
}

export function fetchPR(id: number): IAPIPR | null {
  try {
    const response = execSync(
      `gh pr view ${id} --json title,body,headRefName,url`,
      {
        encoding: 'utf8',
      }
    )

    return JSON.parse(response)
  } catch (e) {
    return null
  }
}

export function createPR(
  title: string,
  body: string,
  branch: string
): IAPIPR | null {
  try {
    const response = execSync(
      `gh pr new --repo desktop/desktop --title "${title}" --body "${body}" --head ${branch}`,
      {
        encoding: 'utf8',
      }
    )

    // The PR url is the last line of the output
    const url = response.split('\n').pop() ?? ''

    return {
      title,
      body,
      headRefName: branch,
      url,
    }
  } catch (e) {
    return null
  }
}
