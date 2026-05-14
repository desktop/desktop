import { Commit } from '../../models/commit'

/**
 * A single node in the rendered branch graph. One row per commit.
 *
 * `lane` is the column the commit's circle is drawn in. `edges` describes
 * every line that crosses this row vertically (either passing through, or
 * starting/ending at this row).
 */
export interface IGraphNode {
  readonly sha: string
  readonly lane: number

  /** Lines drawn in this row. */
  readonly edges: ReadonlyArray<IGraphEdge>
}

/**
 * Where in the row an edge is drawn.
 *
 *   - `top-half`: from the row's top edge down to the dot at the middle
 *     (incoming line — a parent landing on this commit's lane).
 *   - `bottom-half`: from the dot at the middle down to the row's bottom edge
 *     (outgoing line — this commit fanning out to a parent).
 *   - `through`: a full-height line crossing the row without touching the dot
 *     (a lane carrying some other commit through this row).
 */
export type GraphEdgeKind = 'top-half' | 'bottom-half' | 'through'

/**
 * A line segment to draw in a single row.
 *
 * Coordinates are lane indices. A straight pass-through uses the same lane
 * for `fromLane` and `toLane`; a merge or branch uses different values.
 */
export interface IGraphEdge {
  /** Lane the line enters the row from (top edge). */
  readonly fromLane: number
  /** Lane the line exits the row to (bottom edge). */
  readonly toLane: number
  /** Where in the row this edge is drawn. */
  readonly kind: GraphEdgeKind
  /** Stable color index for the lane (cycles through a palette in CSS). */
  readonly colorIndex: number
}

export interface IGraphLayout {
  readonly nodes: ReadonlyArray<IGraphNode>
  /** Maximum lane index used. Determines the width of the graph column. */
  readonly maxLane: number
}

/**
 * What an active lane is waiting for, plus whether it landed there as a
 * first-parent continuation (a "branch child" in pvigier's terminology) or
 * as a side-parent edge from a merge. First-parent waiters take precedence
 * when a commit is reached from multiple lanes — that's what keeps a branch
 * visually straight through its first-parent chain.
 */
interface LaneEntry {
  readonly sha: string
  readonly isFirstParent: boolean
}

/**
 * Walk HEAD's first-parent chain from the newest commit and collect the
 * SHAs that should live on lane 0. The set lets us force the trunk back
 * onto column 0 whenever date-order would otherwise sneak a side branch
 * into the leftmost slot.
 */
function computeTrunkSet(commits: ReadonlyArray<Commit>): Set<string> {
  const trunk = new Set<string>()
  if (commits.length === 0) {
    return trunk
  }

  const byShaInWindow = new Map<string, Commit>()
  for (const c of commits) {
    byShaInWindow.set(c.sha, c)
  }

  let sha: string | undefined = commits[0].sha
  while (sha !== undefined && !trunk.has(sha)) {
    trunk.add(sha)
    const c = byShaInWindow.get(sha)
    sha = c?.parentSHAs[0]
  }
  return trunk
}

/**
 * Walk the commit list (newest first, date-ordered) and assign each commit
 * a lane plus the edges that render in its row.
 *
 * Rules:
 *   - HEAD's first-parent ancestry stays on lane 0 (`trunkSet` guarantees
 *     this even if a side branch's history would otherwise win the lane).
 *   - When multiple lanes are waiting for the same commit, prefer the one
 *     placed there as a first-parent (a branch continuation) over a merge
 *     side-edge. This matches `git log --graph` and pvigier's straight-
 *     branches algorithm.
 *   - New side branches always allocate strictly right of the current
 *     commit's lane, so branches spur right and only shift back left when
 *     they merge into an existing lane.
 *   - Closed lanes are nil-ed in place (never spliced), preserving column
 *     identity and color for any lanes still active to their right.
 */
export function computeGraphLayout(
  commits: ReadonlyArray<Commit>
): IGraphLayout {
  const nodes: IGraphNode[] = []
  const trunkSet = computeTrunkSet(commits)

  // activeLanes[i] = which SHA lane i is waiting for and how it got there,
  // or null if the lane is currently empty.
  const activeLanes: Array<LaneEntry | null> = []

  // Stable color assignment per lane index. Re-allocated lanes get a fresh
  // color since the previous occupant has been removed.
  const colorByLane = new Map<number, number>()
  let nextColor = 0

  const allocateLane = (after: number = -1): number => {
    for (let i = after + 1; i < activeLanes.length; i++) {
      if (activeLanes[i] === null) {
        return i
      }
    }
    activeLanes.push(null)
    return activeLanes.length - 1
  }

  const ensureColor = (lane: number): number => {
    let c = colorByLane.get(lane)
    if (c === undefined) {
      c = nextColor++
      colorByLane.set(lane, c)
    }
    return c
  }

  const indexOfSha = (sha: string): number => {
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i]?.sha === sha) {
        return i
      }
    }
    return -1
  }

  for (const commit of commits) {
    // Lanes currently waiting for this commit. We separate first-parent
    // waiters because they get priority for `commitLane`.
    const waitingLanes: number[] = []
    const firstParentLanes: number[] = []
    for (let i = 0; i < activeLanes.length; i++) {
      const entry = activeLanes[i]
      if (entry !== null && entry.sha === commit.sha) {
        waitingLanes.push(i)
        if (entry.isFirstParent) {
          firstParentLanes.push(i)
        }
      }
    }

    const onTrunk = trunkSet.has(commit.sha)

    let commitLane: number
    if (onTrunk) {
      // HEAD's first-parent ancestry is always rendered on lane 0. Lane 0
      // is normally already waiting for this commit (the previous trunk
      // commit placed it there); if it's empty (very first commit) we
      // allocate it now.
      if (activeLanes.length === 0) {
        activeLanes.push(null)
      }
      commitLane = 0
    } else if (firstParentLanes.length > 0) {
      commitLane = firstParentLanes[0]
    } else if (waitingLanes.length > 0) {
      commitLane = waitingLanes[0]
    } else {
      commitLane = allocateLane()
    }
    ensureColor(commitLane)

    // Make sure commitLane is in waitingLanes for edge emission below — we
    // always draw a top-half line from the commit's own lane down to its
    // dot when that lane existed in the previous row.
    if (
      !waitingLanes.includes(commitLane) &&
      activeLanes[commitLane]?.sha === commit.sha
    ) {
      waitingLanes.push(commitLane)
    }

    // Snapshot the lanes BEFORE we mutate — this is "the top edge".
    const topLanes = activeLanes.slice()

    // Clear waiting lanes; we'll re-populate commitLane from the first
    // parent and any new side lanes from the other parents below.
    for (const i of waitingLanes) {
      activeLanes[i] = null
    }
    if (!waitingLanes.includes(commitLane)) {
      activeLanes[commitLane] = null
    }

    // Route parents into lanes.
    const parents = commit.parentSHAs
    if (parents.length > 0) {
      // Always continue the commit's lane down to its first parent. If
      // another lane already carries that parent the two lanes will
      // converge when we reach it, but in the meantime the side branch
      // stays visually anchored to the commit it started from. Promote
      // any pre-existing entry for the same SHA to first-parent so it
      // wins commitLane preference at the convergence row.
      const firstParent = parents[0]
      const existingForFirst = indexOfSha(firstParent)
      activeLanes[commitLane] = {
        sha: firstParent,
        isFirstParent: true,
      }
      if (existingForFirst !== -1 && existingForFirst !== commitLane) {
        const existing = activeLanes[existingForFirst]
        if (existing !== null && !existing.isFirstParent) {
          activeLanes[existingForFirst] = {
            sha: existing.sha,
            isFirstParent: true,
          }
        }
      }

      for (let p = 1; p < parents.length; p++) {
        const parent = parents[p]
        if (indexOfSha(parent) !== -1) {
          continue
        }
        const lane = allocateLane(commitLane)
        activeLanes[lane] = { sha: parent, isFirstParent: false }
        ensureColor(lane)
      }
    }

    // Snapshot lanes AFTER mutation — "the bottom edge".
    const bottomLanes = activeLanes.slice()

    const edges: IGraphEdge[] = []

    // Pass-through lanes: existed before AND after this row, but aren't
    // this commit's lane (which is handled by top/bottom-half edges below).
    // Prefer staying in the same column when the same lane still carries
    // the same SHA — otherwise multi-lane duplicates of one SHA would all
    // collapse into bogus diagonals into the leftmost match.
    for (let i = 0; i < topLanes.length; i++) {
      const top = topLanes[i]
      if (top === null || top.sha === commit.sha) {
        continue
      }
      let newLane: number
      const sameLane = bottomLanes[i]
      if (sameLane !== null && sameLane.sha === top.sha) {
        newLane = i
      } else {
        newLane = bottomLanes.findIndex(b => b !== null && b.sha === top.sha)
      }
      if (newLane !== -1) {
        edges.push({
          fromLane: i,
          toLane: newLane,
          kind: 'through',
          colorIndex: ensureColor(newLane),
        })
      }
    }

    // Top-half edges: every lane that was waiting for this commit lands on
    // its dot, including the commit's own lane.
    for (const i of waitingLanes) {
      edges.push({
        fromLane: i,
        toLane: commitLane,
        kind: 'top-half',
        colorIndex: ensureColor(commitLane),
      })
    }

    // Bottom-half edges: from the dot down to each parent's lane. The
    // first parent is always placed on commitLane (so its line continues
    // straight down through the dot); other parents go wherever their
    // lane was allocated.
    for (let p = 0; p < parents.length; p++) {
      const parent = parents[p]
      let parentLane: number
      if (
        p === 0 &&
        bottomLanes[commitLane] !== null &&
        bottomLanes[commitLane]!.sha === parent
      ) {
        parentLane = commitLane
      } else {
        parentLane = bottomLanes.findIndex(b => b !== null && b.sha === parent)
      }
      if (parentLane === -1) {
        continue
      }
      edges.push({
        fromLane: commitLane,
        toLane: parentLane,
        kind: 'bottom-half',
        colorIndex: ensureColor(parentLane),
      })
    }

    nodes.push({ sha: commit.sha, lane: commitLane, edges })

    // Trim trailing empty lanes. Lane 0 is special — keep it allocated for
    // the trunk even when temporarily empty so we never re-color it.
    while (
      activeLanes.length > 1 &&
      activeLanes[activeLanes.length - 1] === null
    ) {
      const removed = activeLanes.length - 1
      colorByLane.delete(removed)
      activeLanes.pop()
    }
  }

  let maxLane = 0
  for (const node of nodes) {
    if (node.lane > maxLane) {
      maxLane = node.lane
    }
    for (const edge of node.edges) {
      if (edge.fromLane > maxLane) {
        maxLane = edge.fromLane
      }
      if (edge.toLane > maxLane) {
        maxLane = edge.toLane
      }
    }
  }

  return { nodes, maxLane }
}
