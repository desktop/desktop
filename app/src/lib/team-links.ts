/**
 * Team specific customizations for the HAL2026 MS build of the app.
 *
 * Edit this file to change the links shown in the bar at the bottom of the
 * window.
 */

export interface ITeamLink {
  /** Short label shown in the bar */
  readonly label: string
  /** Emoji shown in front of the label */
  readonly icon: string
  /** Tooltip / accessible description */
  readonly description: string
  readonly url: string
}

/** The name of the team, shown in the bar at the bottom of the window. */
export const teamName = 'HAL2026_MS'

/** The team's Gitea server, used as the default when adding an account. */
export const teamGiteaServer = 'https://gitea-proxy.mt-cloud.workers.dev'

export const teamLinks: ReadonlyArray<ITeamLink> = [
  {
    label: 'ドライブ',
    icon: '📁',
    description: 'チームの共有ドライブを開く',
    url: 'https://drive.google.com/drive/folders/1nlj9wwaEi6w3Yn3BuKB2Om5Qz79HUWaz?usp=drive_link',
  },
  {
    label: 'ビルド',
    icon: '📦',
    description: 'ビルド成果物のフォルダを開く',
    url: 'https://drive.google.com/drive/folders/1eA39YkZEMAK6FOKZh8oo22OW1_X9NyTk?usp=drive_link',
  },
  {
    label: 'カレンダー',
    icon: '📅',
    description: 'チームのカレンダーを開く',
    url: 'https://calendar.google.com/calendar/u/0/r?cid=YjY0ZDEyYzZkOWJhMDVlNDFkZDUzZGI2Yjc4YmQyYjM3M2RjZThmMDFhZWRkZmIyZTU3N2FkYjE5ZjE3NGZiYkBncm91cC5jYWxlbmRhci5nb29nbGUuY29t',
  },
  {
    label: 'リポジトリ',
    icon: '🍵',
    description: 'Gitea のリポジトリを開く',
    url: `${teamGiteaServer}/HAL2026_MS/HAL2026_MSProject`,
  },
  {
    label: '仕様書',
    icon: '📝',
    description: '仕様書のフォルダを開く',
    url: 'https://drive.google.com/drive/folders/1ygi4C8uLXuME0-aEfENOlbbKpjdrnGeG?usp=drive_link',
  },
]

/**
 * A greeting which changes with the time of day, shown next to the team name
 * for a bit of fun.
 */
export function getTeamGreeting(date: Date = new Date()): string {
  const hour = date.getHours()

  if (hour >= 5 && hour < 11) {
    return 'おはようございます ☀️'
  } else if (hour >= 11 && hour < 14) {
    return 'お昼ごはん食べました? 🍙'
  } else if (hour >= 14 && hour < 18) {
    return '今日もいいコミットを 🚀'
  } else if (hour >= 18 && hour < 22) {
    return 'おつかれさまです 🍵'
  } else {
    return '夜更かしはほどほどに 🌙'
  }
}
