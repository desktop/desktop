/**
 * Team specific customizations for the HAL2026 MS build of the app.
 *
 * Edit this file to change the links shown in the bar at the bottom of the
 * window.
 */

/** The icons available for team links, see TeamBar */
export type TeamLinkIcon =
  | 'folder'
  | 'build'
  | 'calendar'
  | 'repo'
  | 'document'
  | 'docs'
  | 'chat'

export interface ITeamLink {
  /** Short label shown in the bar */
  readonly label: string
  /** Icon shown in front of the label */
  readonly icon: TeamLinkIcon
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
    icon: 'folder',
    description: 'チームの共有ドライブを開く',
    url: 'https://drive.google.com/drive/folders/1nlj9wwaEi6w3Yn3BuKB2Om5Qz79HUWaz?usp=drive_link',
  },
  {
    label: 'ビルド',
    icon: 'build',
    description: 'ビルド成果物のフォルダを開く',
    url: 'https://drive.google.com/drive/folders/1eA39YkZEMAK6FOKZh8oo22OW1_X9NyTk?usp=drive_link',
  },
  {
    label: 'カレンダー',
    icon: 'calendar',
    description: 'チームのカレンダーを開く',
    url: 'https://calendar.google.com/calendar/u/0/r?cid=YjY0ZDEyYzZkOWJhMDVlNDFkZDUzZGI2Yjc4YmQyYjM3M2RjZThmMDFhZWRkZmIyZTU3N2FkYjE5ZjE3NGZiYkBncm91cC5jYWxlbmRhci5nb29nbGUuY29t',
  },
  {
    label: 'リポジトリ',
    icon: 'repo',
    description: 'Gitea のリポジトリを開く',
    url: `${teamGiteaServer}/HAL2026_MS/HAL2026_MSProject`,
  },
  {
    label: '仕様書',
    icon: 'document',
    description: '仕様書のフォルダを開く',
    url: 'https://drive.google.com/drive/folders/1ygi4C8uLXuME0-aEfENOlbbKpjdrnGeG?usp=drive_link',
  },
  {
    label: 'ドキュメント',
    icon: 'docs',
    description: 'チームのドキュメントを開く',
    url: 'https://msdocs.m1r4i.com/docs/Documents/README.md?b=develop',
  },
  {
    label: 'Discord',
    icon: 'chat',
    description: 'チームの Discord を開く',
    url: 'https://discord.com/channels/1539970951481921657/1539970953046528115',
  },
]

/** A greeting which changes with the time of day, shown on the home screen. */
export function getTeamGreeting(date: Date = new Date()): string {
  const hour = date.getHours()

  if (hour >= 5 && hour < 11) {
    return 'おはようございます'
  } else if (hour >= 11 && hour < 14) {
    return 'お昼の時間です'
  } else if (hour >= 14 && hour < 18) {
    return '今日もいいコミットを'
  } else if (hour >= 18 && hour < 22) {
    return 'おつかれさまです'
  } else {
    return '夜更かしはほどほどに'
  }
}
