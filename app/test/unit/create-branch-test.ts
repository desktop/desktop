import { getStartPoint } from '../../src/lib/create-branch'
import { TipState, IValidBranch, IDetachedHead } from '../../src/models/tip'
import {
  BranchType,
  StartPoint,
  IBranchTip,
  Branch,
} from '../../src/models/branch'
import { CommitIdentity } from '../../src/models/commit-identity'

const stubAuthor: CommitIdentity = {
  name: 'Brendan Forster',
  email: 'brendan@example.com',
  date: new Date(),
  tzOffset: 0,
}

const stubTip: IBranchTip = {
  sha: 'deadbeef',
  author: stubAuthor,
}

const defaultBranch: Branch = {
  name: 'my-default-branch',
  upstream: null,
  tip: stubTip,
  type: BranchType.Local,
  remoteName: null,
  upstreamRemoteName: null,
  upstreamWithoutRemote: null,
  nameWithoutRemote: 'my-default-branch',
  isDesktopForkRemoteBranch: false,
  ref: '',
}

const upstreamDefaultBranch = null

const someOtherBranch: Branch = {
  name: 'some-other-branch',
  upstream: null,
  tip: stubTip,
  type: BranchType.Local,
  remoteName: null,
  upstreamRemoteName: null,
  upstreamWithoutRemote: null,
  nameWithoutRemote: 'some-other-branch',
  isDesktopForkRemoteBranch: false,
  ref: '',
}

describe('create-branch/getStartPoint', () => {
  describe('for default branch', () => {
    const tip: IValidBranch = {
      kind: TipState.Valid,
      branch: defaultBranch,
    }

    const action = (startPoint: StartPoint) => {
      return getStartPoint(
        { tip, defaultBranch, upstreamDefaultBranch },
        startPoint
      )
    }

    it('returns current HEAD when HEAD requested', () => {
      expect(action(StartPoint.Head)).toBe(StartPoint.Head)
    })

    it('chooses current branch when current branch requested', () => {
      expect(action(StartPoint.CurrentBranch)).toBe(StartPoint.CurrentBranch)
    })

    it('chooses default branch when default branch requested', () => {
      expect(action(StartPoint.DefaultBranch)).toBe(StartPoint.DefaultBranch)
    })
  })

  describe('for a non-default branch', () => {
    const tip: IValidBranch = {
      kind: TipState.Valid,
      branch: someOtherBranch,
    }

    const action = (startPoint: StartPoint) => {
      return getStartPoint(
        { tip, defaultBranch, upstreamDefaultBranch },
        startPoint
      )
    }

    it('returns current HEAD when HEAD requested', () => {
      expect(action(StartPoint.Head)).toBe(StartPoint.Head)
    })

    it('chooses current branch when current branch requested', () => {
      expect(action(StartPoint.CurrentBranch)).toBe(StartPoint.CurrentBranch)
    })

    it('chooses default branch when default branch requested', () => {
      expect(action(StartPoint.DefaultBranch)).toBe(StartPoint.DefaultBranch)
    })
  })

  describe('for detached HEAD', () => {
    const tip: IDetachedHead = {
      kind: TipState.Detached,
      currentSha: 'deadbeef',
    }

    const action = (startPoint: StartPoint) => {
      return getStartPoint(
        { tip, defaultBranch, upstreamDefaultBranch },
        startPoint
      )
    }

    it('returns current HEAD when HEAD requested', () => {
      expect(action(StartPoint.Head)).toBe(StartPoint.Head)
    })

    it('returns current HEAD when current branch requested', () => {
      expect(action(StartPoint.CurrentBranch)).toBe(StartPoint.Head)
    })

    it('returns current HEAD when default branch requested', () => {
      expect(action(StartPoint.DefaultBranch)).toBe(StartPoint.Head)
    })
  })
})
