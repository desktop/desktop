import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getStartPoint } from '../../src/lib/create-branch'
import { TipState, IValidBranch, IDetachedHead } from '../../src/models/tip'
import {
  BranchType,
  StartPoint,
  IBranchTip,
  Branch,
} from '../../src/models/branch'

const stubTip: IBranchTip = {
  sha: 'deadbeef',
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
      assert.equal(action(StartPoint.Head), StartPoint.Head)
    })

    it('chooses current branch when current branch requested', () => {
      assert.equal(action(StartPoint.CurrentBranch), StartPoint.CurrentBranch)
    })

    it('chooses default branch when default branch requested', () => {
      assert.equal(action(StartPoint.DefaultBranch), StartPoint.DefaultBranch)
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
      assert.equal(action(StartPoint.Head), StartPoint.Head)
    })

    it('chooses current branch when current branch requested', () => {
      assert.equal(action(StartPoint.CurrentBranch), StartPoint.CurrentBranch)
    })

    it('chooses default branch when default branch requested', () => {
      assert.equal(action(StartPoint.DefaultBranch), StartPoint.DefaultBranch)
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
      assert.equal(action(StartPoint.Head), StartPoint.Head)
    })

    it('returns current HEAD when current branch requested', () => {
      assert.equal(action(StartPoint.CurrentBranch), StartPoint.Head)
    })

    it('returns current HEAD when default branch requested', () => {
      assert.equal(action(StartPoint.DefaultBranch), StartPoint.Head)
    })
  })
})
