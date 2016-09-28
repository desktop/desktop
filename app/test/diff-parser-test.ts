import * as chai from 'chai'
const expect = chai.expect

import { DiffParser } from '../src/lib/diff-parser'
import { DiffLineType } from '../src/models/diff'

// Atom doesn't like lines with just one space and tries to
// de-indent so when copying- and pasting diff contents the
// space signalling that the line is a context line gets lost.
//
// This function reinstates that space and makes us all
// feel a little bit sad.
function reinstateSpacesAtTheStartOfBlankLines(text: string) {
  return text.replace(/\n\n/g, '\n \n')
}

describe('DiffParser', () => {
  it('properly parses changed files', () => {
    const diffText = `diff --git a/app/src/lib/diff-parser.ts b/app/src/lib/diff-parser.ts
index e1d4871..3bd3ee0 100644
--- a/app/src/lib/diff-parser.ts
+++ b/app/src/lib/diff-parser.ts
@@ -18,6 +18,7 @@ export function parseRawDiff(lines: ReadonlyArray<string>): Diff {

     let numberOfUnifiedDiffLines = 0

+
     while (prefixFound) {

       // trim any preceding text
@@ -71,12 +72,9 @@ export function parseRawDiff(lines: ReadonlyArray<string>): Diff {
         diffSections.push(new DiffSection(range, diffLines, startDiffSection, endDiffSection))
       } else {
         const diffBody = diffTextBuffer
-
         let startDiffSection: number = 0
         let endDiffSection: number = 0
-
         const diffLines = diffBody.split('\\n')
-
         if (diffSections.length === 0) {
           startDiffSection = 0
           endDiffSection = diffLines.length
@@ -84,10 +82,8 @@ export function parseRawDiff(lines: ReadonlyArray<string>): Diff {
           startDiffSection = numberOfUnifiedDiffLines
           endDiffSection = startDiffSection + diffLines.length
         }
-
         diffSections.push(new DiffSection(range, diffLines, startDiffSection, endDiffSection))
       }
     }
-
     return new Diff(diffSections)
 }
    `

    const parser = new DiffParser()
    const diff = parser.parse(reinstateSpacesAtTheStartOfBlankLines(diffText))
    expect(diff.sections.length).to.equal(3)

    let section = diff.sections[0]
    expect(section.unifiedDiffStart).to.equal(0)
    expect(section.unifiedDiffEnd).to.equal(7)

    let lines = section.lines
    expect(lines.length).to.equal(8)

    let i = 0
    expect(lines[i].text).to.equal('@@ -18,6 +18,7 @@ export function parseRawDiff(lines: ReadonlyArray<string>): Diff {')
    expect(lines[i].type).to.equal(DiffLineType.Hunk)
    expect(lines[i].oldLineNumber).to.equal(null)
    expect(lines[i].newLineNumber).to.equal(null)
    i++

    expect(lines[i].text).to.equal(' ')
    expect(lines[i].type).to.equal(DiffLineType.Context)
    expect(lines[i].oldLineNumber).to.equal(18)
    expect(lines[i].newLineNumber).to.equal(18)
    i++

    expect(lines[i].text).to.equal('     let numberOfUnifiedDiffLines = 0')
    expect(lines[i].type).to.equal(DiffLineType.Context)
    expect(lines[i].oldLineNumber).to.equal(19)
    expect(lines[i].newLineNumber).to.equal(19)
    i++

    expect(lines[i].text).to.equal(' ')
    expect(lines[i].type).to.equal(DiffLineType.Context)
    expect(lines[i].oldLineNumber).to.equal(20)
    expect(lines[i].newLineNumber).to.equal(20)
    i++

    expect(lines[i].text).to.equal('+')
    expect(lines[i].type).to.equal(DiffLineType.Add)
    expect(lines[i].oldLineNumber).to.equal(null)
    expect(lines[i].newLineNumber).to.equal(21)
    i++

    expect(lines[i].text).to.equal('     while (prefixFound) {')
    expect(lines[i].type).to.equal(DiffLineType.Context)
    expect(lines[i].oldLineNumber).to.equal(21)
    expect(lines[i].newLineNumber).to.equal(22)
    i++

    section = diff.sections[1]
    expect(section.unifiedDiffStart).to.equal(8)
    expect(section.unifiedDiffEnd).to.equal(20)

    lines = section.lines
    expect(lines.length).to.equal(13)
  })

  it('properly parses new files', () => {
    const diffText = `diff --git a/testste b/testste
new file mode 100644
index 0000000..f13588b
--- /dev/null
+++ b/testste
@@ -0,0 +1 @@
+asdfasdf
`

    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    expect(diff.sections.length).to.equal(1)

    const section = diff.sections[0]
    expect(section.unifiedDiffStart).to.equal(0)
    expect(section.unifiedDiffEnd).to.equal(1)

    const lines = section.lines
    expect(lines.length).to.equal(2)

    let i = 0
    expect(lines[i].text).to.equal('@@ -0,0 +1 @@')
    expect(lines[i].type).to.equal(DiffLineType.Hunk)
    expect(lines[i].oldLineNumber).to.equal(null)
    expect(lines[i].newLineNumber).to.equal(null)
    i++

    expect(lines[i].text).to.equal('+asdfasdf')
    expect(lines[i].type).to.equal(DiffLineType.Add)
    expect(lines[i].oldLineNumber).to.equal(null)
    expect(lines[i].newLineNumber).to.equal(1)
    i++
  })

  it('properly parses files containing @@', () => {
    const diffText = `diff --git a/test.txt b/test.txt
index 24219cc..bf711a5 100644
--- a/test.txt
+++ b/test.txt
@@ -1 +1 @@
-foo @@
+@@ foo
`

    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    expect(diff.sections.length).to.equal(1)

    const section = diff.sections[0]
    expect(section.unifiedDiffStart).to.equal(0)
    expect(section.unifiedDiffEnd).to.equal(2)

    const lines = section.lines
    expect(lines.length).to.equal(3)

    let i = 0
    expect(lines[i].text).to.equal('@@ -1 +1 @@')
    expect(lines[i].type).to.equal(DiffLineType.Hunk)
    expect(lines[i].oldLineNumber).to.equal(null)
    expect(lines[i].newLineNumber).to.equal(null)
    i++

    expect(lines[i].text).to.equal('-foo @@')
    expect(lines[i].type).to.equal(DiffLineType.Delete)
    expect(lines[i].oldLineNumber).to.equal(1)
    expect(lines[i].newLineNumber).to.equal(null)
    i++

    expect(lines[i].text).to.equal('+@@ foo')
    expect(lines[i].type).to.equal(DiffLineType.Add)
    expect(lines[i].oldLineNumber).to.equal(null)
    expect(lines[i].newLineNumber).to.equal(1)
    i++
  })

  it('properly parses new files without a newline at end of file', () => {
    const diffText = `diff --git a/test2.txt b/test2.txt
new file mode 100644
index 0000000..faf7da1
--- /dev/null
+++ b/test2.txt
@@ -0,0 +1 @@
+asdasdasd
\\ No newline at end of file
`

    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    expect(diff.sections.length).to.equal(1)

    const section = diff.sections[0]
    expect(section.unifiedDiffStart).to.equal(0)
    expect(section.unifiedDiffEnd).to.equal(1)

    const lines = section.lines
    expect(lines.length).to.equal(2)

    let i = 0
    expect(lines[i].text).to.equal('@@ -0,0 +1 @@')
    expect(lines[i].type).to.equal(DiffLineType.Hunk)
    expect(lines[i].oldLineNumber).to.equal(null)
    expect(lines[i].newLineNumber).to.equal(null)
    expect(lines[i].noTrailingNewLine).to.be.false
    i++

    expect(lines[i].text).to.equal('+asdasdasd')
    expect(lines[i].type).to.equal(DiffLineType.Add)
    expect(lines[i].oldLineNumber).to.equal(null)
    expect(lines[i].newLineNumber).to.equal(1)
    expect(lines[i].noTrailingNewLine).to.be.true
    i++
  })

  it('properly parses diffs that adds newline to end of file', () => {
    const diffText = `diff --git a/test2.txt b/test2.txt
index 1910281..257cc56 100644
--- a/test2.txt
+++ b/test2.txt
@@ -1 +1 @@
-foo
\\ No newline at end of file
+foo
`
    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    expect(diff.sections.length).to.equal(1)

    const section = diff.sections[0]
    expect(section.unifiedDiffStart).to.equal(0)
    expect(section.unifiedDiffEnd).to.equal(2)

    const lines = section.lines
    expect(lines.length).to.equal(3)

    let i = 0
    expect(lines[i].text).to.equal('@@ -1 +1 @@')
    expect(lines[i].type).to.equal(DiffLineType.Hunk)
    expect(lines[i].oldLineNumber).to.equal(null)
    expect(lines[i].newLineNumber).to.equal(null)
    expect(lines[i].noTrailingNewLine).to.be.false
    i++

    expect(lines[i].text).to.equal('-foo')
    expect(lines[i].type).to.equal(DiffLineType.Delete)
    expect(lines[i].oldLineNumber).to.equal(1)
    expect(lines[i].newLineNumber).to.equal(null)
    expect(lines[i].noTrailingNewLine).to.be.true
    i++

    expect(lines[i].text).to.equal('+foo')
    expect(lines[i].type).to.equal(DiffLineType.Add)
    expect(lines[i].oldLineNumber).to.equal(null)
    expect(lines[i].newLineNumber).to.equal(1)
    expect(lines[i].noTrailingNewLine).to.be.false
    i++

  })

  it('properly parses binary diffs', () => {
    const diffText = `diff --git a/IMG_2306.CR2 b/IMG_2306.CR2
new file mode 100644
index 0000000..4bf3a64
Binary files /dev/null and b/IMG_2306.CR2 differ
`
    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    expect(diff.sections.length).to.equal(0)
    expect(diff.isBinary).to.equal(true)
  })

  it('properly parses diff of empty file', () => {
    // To produce this output, do
    // touch foo
    // git diff --no-index --patch-with-raw -z -- /dev/null foo
    const diffText = `new file mode 100644
index 0000000..e69de29
`

    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    expect(diff.sections.length).to.equal(0)
  })
})
