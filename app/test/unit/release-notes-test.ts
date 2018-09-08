import { expect } from 'chai'

import {
  parseReleaseEntries,
  getReleaseSummary,
} from '../../src/lib/release-notes'

describe('release-notes', () => {
  describe('parseReleaseEntries', () => {
    it('formats lowercased fixed message', () => {
      const values = ['[fixed] something else']

      const result = parseReleaseEntries(values)

      expect(result.length).to.equal(1)
      expect(result[0].kind).to.equal('fixed')
      expect(result[0].message).to.equal('something else')
    })
    it('formats uppercased fixed message', () => {
      const values = ['[Fixed] and another thing']

      const result = parseReleaseEntries(values)

      expect(result.length).to.equal(1)
      expect(result[0].kind).to.equal('fixed')
      expect(result[0].message).to.equal('and another thing')
    })
    it('uses [Other] for unrecognized category', () => {
      const values = ['[Foo] we did a thing!']

      const result = parseReleaseEntries(values)

      expect(result.length).to.equal(1)
      expect(result[0].kind).to.equal('other')
      expect(result[0].message).to.equal('we did a thing!')
    })
  })

  describe('getReleaseSummary', () => {
    it('can render 1.0.11 layout', () => {
      const oneOhEleveRelease = {
        name: '',
        notes: [
          '[New] Highlight substring matches in the "Branches" and "Repositories" list when filtering - #910. Thanks @JordanMussi!',
          '[New] Add preview for ico files - #3531. Thanks @serhiivinichuk!',
          '[New] Fallback to Gravatar for loading avatars - #821',
          '[New] Provide syntax highlighting for Visual Studio project files - #3552. Thanks @saul!',
          '[New] Provide syntax highlighting for F# fsx and fsi files - #3544. Thanks @saul!',
          '[New] Provide syntax highlighting for Kotlin files - #3555. Thanks @ziggy42!',
          '[New] Provide syntax highlighting for Clojure - #3523. Thanks @mtkp!',
          '[Improved] Toggle the "Repository List" from the menu - #2638. Thanks @JordanMussi!',
          '[Improved] Prevent saving of disallowed character strings for your name and email  - #3204',
          '[Improved] Error messages now appear at the top of the "Create a New Repository" dialog - #3571. Thanks @http-request!',
          '[Improved] "Repository List" header is now "Github.com" for consistency - #3567. Thanks @iFun!',
          '[Improved] Rename the "Install Update" button to "Quit and Install Update" - #3494. Thanks @say25!',
          '[Fixed] Fix ordering of commit history when your branch and tracking branch have both changed  - #2737',
          '[Fixed] Prevent creating a branch that starts with a period - #3013. Thanks @JordanMussi!',
          '[Fixed] Branch names are properly encoded when creating a pull request - #3509',
          '[Fixed] Re-enable all the menu items after closing a popup - #3533',
          "[Fixed] Removes option to delete remote branch after it's been deleted - #2964. Thanks @JordanMussi!",
          '[Fixed] Windows: Detects available editors and shells now works even when the group policy blocks write registry access - #3105 #3405',
          '[Fixed] Windows: Menu items are no longer truncated - #3547',
          '[Fixed] Windows: Prevent disabled menu items from being accessed - #3391 #1521',
        ],
        pub_date: '2017-12-14T01:20:26Z',
        version: '1.0.11',
      }

      const result = getReleaseSummary(oneOhEleveRelease)
      expect(result.latestVersion).to.equal('1.0.11')
      // the generated date here is local time, so it might either be the 5th or 6th
      // let's just test it's showing the right month and year instead
      expect(result.datePublished).contains('December')
      expect(result.datePublished).contains('2017')
      expect(result.bugfixes.length).to.equal(8)
      expect(result.enhancements.length).to.equal(12)
    })

    it('can render 1.0.10 layout', () => {
      const oneOhTenRelease = {
        name: '',
        notes: [
          '[New] ColdFusion Builder is now a supported external editor - #3336 #3321. Thanks @AtomicCons!',
          '[New] VSCode Insiders build is now a supported external editor - #3441. Thanks @say25!',
          '[New] BBEdit is now a supported external editor - #3467. Thanks @NiklasBr!',
          '[New] Hyper is now a supported shell on Windows too - #3455. Thanks @JordanMussi!',
          '[New] Swift is now syntax highlighted - #3305. Thanks @agisilaos!',
          '[New] Vue.js is now syntax highlighted - #3368. Thanks @wanecek!',
          '[New] CoffeeScript is now syntax highlighted - #3356. Thanks @agisilaos!',
          '[New] Cypher is now syntax highlighted - #3440. Thanks @say25!',
          '[New] .hpp is now syntax highlighted as C++ - #3420. Thanks @say25!',
          '[New] ML-like languages are now syntax highlighted - #3401. Thanks @say25!',
          '[New] Objective-C is now syntax highlighted - #3355. Thanks @koenpunt!',
          '[New] SQL is now syntax highlighted - #3389. Thanks @say25!',
          "[Improved] Better message on the 'Publish Branch' button when HEAD is unborn - #3344. Thanks @Venkat5694!",
          '[Improved] Better error message when trying to push to an archived repository - #3084. Thanks @agisilaos!',
          '[Improved] Avoid excessive background fetching when switching repositories - #3329',
          '[Improved] Ignore menu events sent when a modal is shown - #3308',
          '[Fixed] Parse changed files whose paths include a newline - #3271',
          '[Fixed] Parse file type changes - #3334',
          "[Fixed] Windows: 'Open without Git' would present the dialog again instead of actually opening a shell without git - #3290",
          '[Fixed] Avoid text selection when dragging resizable dividers - #3268',
          '[Fixed] Windows: Removed the title attribute on the Windows buttons so that they no longer leave their tooltips hanging around - #3348. Thanks @j-f1!',
          '[Fixed] Windows: Detect VS Code when installed to non-standard locations - #3304',
          '[Fixed] Hitting Return would select the first item in a filter list when the filter text was empty - #3447',
          '[Fixed] Add some missing keyboard shortcuts - #3327. Thanks @say25!',
          '[Fixed] Handle "304 Not Modified" responses - #3399',
          "[Fixed] Don't overwrite an existing .gitattributes when creating a new repository - #3419. Thanks @strafe!",
        ],
        pub_date: '2017-12-05T17:05:01Z',
        version: '1.0.10',
      }

      const result = getReleaseSummary(oneOhTenRelease)
      expect(result.latestVersion).to.equal('1.0.10')
      // the generated date here is local time, so it might either be the 5th or 6th
      // let's just test it's showing the right month and year instead
      expect(result.datePublished).contains('December')
      expect(result.datePublished).contains('2017')
      expect(result.bugfixes.length).to.equal(10)
      expect(result.enhancements.length).to.equal(16)
    })

    it('can render 1.0.9 layout', () => {
      const oneOhNineRelease = {
        name: '',
        notes: [
          '[New] ColdFusion Builder is now available as an option for External Editor - #3336 #3321. Thanks @AtomicCons!',
          '[New] Swift code is now syntax highlighted - #3305. Thanks @agisilaos!',
          "[Improved] Better message on the 'Publish Branch' button when HEAD is unborn - #3344. Thanks @Venkat5694!",
          '[Improved] Better error message when trying to push to an archived repository - #3084. Thanks @agisilaos!',
          '[Fixed] Parse changed files whose paths include a newline - #3271',
          '[Fixed] Parse file type changes - #3334',
          "[Fixed] Windows: 'Open without Git' would present the dialog again instead of actually opening a shell without git - #3290",
          '[Fixed] Avoid text selection when dragging resizable dividers - #3268',
        ],
        pub_date: '2017-11-16T21:53:23Z',
        version: '1.0.9',
      }

      const result = getReleaseSummary(oneOhNineRelease)
      expect(result.latestVersion).to.equal('1.0.9')
      // the generated date here is local time, so it might either be the 5th or 6th
      // let's just test it's showing the right month and year instead
      expect(result.datePublished).contains('November')
      expect(result.datePublished).contains('2017')
      expect(result.bugfixes.length).to.equal(4)
      expect(result.enhancements.length).to.equal(4)
    })
  })
})
