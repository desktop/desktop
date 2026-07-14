import { describe, it } from 'node:test'
import assert from 'node:assert'
import { DiffParser } from '../../src/lib/diff-parser'
import { DiffLineType } from '../../src/models/diff'

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
  it('parses changed files', () => {
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
    assert.equal(diff.hunks.length, 3)

    let hunk = diff.hunks[0]
    assert.equal(hunk.unifiedDiffStart, 0)
    assert.equal(hunk.unifiedDiffEnd, 7)

    let lines = hunk.lines
    assert.equal(lines.length, 8)

    let i = 0
    assert.equal(
      lines[i].text,
      '@@ -18,6 +18,7 @@ export function parseRawDiff(lines: ReadonlyArray<string>): Diff {'
    )
    assert.equal(lines[i].type, DiffLineType.Hunk)
    assert(lines[i].oldLineNumber === null)
    assert(lines[i].newLineNumber === null)
    i++

    assert.equal(lines[i].text, ' ')
    assert.equal(lines[i].type, DiffLineType.Context)
    assert.equal(lines[i].oldLineNumber, 18)
    assert.equal(lines[i].newLineNumber, 18)
    i++

    assert.equal(lines[i].text, '     let numberOfUnifiedDiffLines = 0')
    assert.equal(lines[i].type, DiffLineType.Context)
    assert.equal(lines[i].oldLineNumber, 19)
    assert.equal(lines[i].newLineNumber, 19)
    i++

    assert.equal(lines[i].text, ' ')
    assert.equal(lines[i].type, DiffLineType.Context)
    assert.equal(lines[i].oldLineNumber, 20)
    assert.equal(lines[i].newLineNumber, 20)
    i++

    assert.equal(lines[i].text, '+')
    assert.equal(lines[i].type, DiffLineType.Add)
    assert(lines[i].oldLineNumber === null)
    assert.equal(lines[i].newLineNumber, 21)
    i++

    assert.equal(lines[i].text, '     while (prefixFound) {')
    assert.equal(lines[i].type, DiffLineType.Context)
    assert.equal(lines[i].oldLineNumber, 21)
    assert.equal(lines[i].newLineNumber, 22)
    i++

    hunk = diff.hunks[1]
    assert.equal(hunk.unifiedDiffStart, 8)
    assert.equal(hunk.unifiedDiffEnd, 20)

    lines = hunk.lines
    assert.equal(lines.length, 13)
  })

  it('parses new files', () => {
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
    assert.equal(diff.hunks.length, 1)

    const hunk = diff.hunks[0]
    assert.equal(hunk.unifiedDiffStart, 0)
    assert.equal(hunk.unifiedDiffEnd, 1)

    const lines = hunk.lines
    assert.equal(lines.length, 2)

    let i = 0
    assert.equal(lines[i].text, '@@ -0,0 +1 @@')
    assert.equal(lines[i].type, DiffLineType.Hunk)
    assert(lines[i].oldLineNumber === null)
    assert(lines[i].newLineNumber === null)
    i++

    assert.equal(lines[i].text, '+asdfasdf')
    assert.equal(lines[i].type, DiffLineType.Add)
    assert(lines[i].oldLineNumber === null)
    assert.equal(lines[i].newLineNumber, 1)
    i++
  })

  it('parses files containing @@', () => {
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
    assert.equal(diff.hunks.length, 1)

    const hunk = diff.hunks[0]
    assert.equal(hunk.unifiedDiffStart, 0)
    assert.equal(hunk.unifiedDiffEnd, 2)

    const lines = hunk.lines
    assert.equal(lines.length, 3)

    let i = 0
    assert.equal(lines[i].text, '@@ -1 +1 @@')
    assert.equal(lines[i].type, DiffLineType.Hunk)
    assert(lines[i].oldLineNumber === null)
    assert(lines[i].newLineNumber === null)
    i++

    assert.equal(lines[i].text, '-foo @@')
    assert.equal(lines[i].type, DiffLineType.Delete)
    assert.equal(lines[i].oldLineNumber, 1)
    assert(lines[i].newLineNumber === null)
    i++

    assert.equal(lines[i].text, '+@@ foo')
    assert.equal(lines[i].type, DiffLineType.Add)
    assert(lines[i].oldLineNumber === null)
    assert.equal(lines[i].newLineNumber, 1)
    i++
  })

  it('parses new files without a newline at end of file', () => {
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
    assert.equal(diff.hunks.length, 1)

    const hunk = diff.hunks[0]
    assert.equal(hunk.unifiedDiffStart, 0)
    assert.equal(hunk.unifiedDiffEnd, 1)

    const lines = hunk.lines
    assert.equal(lines.length, 2)

    let i = 0
    assert.equal(lines[i].text, '@@ -0,0 +1 @@')
    assert.equal(lines[i].type, DiffLineType.Hunk)
    assert(lines[i].oldLineNumber === null)
    assert(lines[i].newLineNumber === null)
    assert.equal(lines[i].noTrailingNewLine, false)
    i++

    assert.equal(lines[i].text, '+asdasdasd')
    assert.equal(lines[i].type, DiffLineType.Add)
    assert(lines[i].oldLineNumber === null)
    assert.equal(lines[i].newLineNumber, 1)
    assert.equal(lines[i].noTrailingNewLine, true)
    i++
  })

  it('parses diffs that adds newline to end of file', () => {
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
    assert.equal(diff.hunks.length, 1)

    const hunk = diff.hunks[0]
    assert.equal(hunk.unifiedDiffStart, 0)
    assert.equal(hunk.unifiedDiffEnd, 2)

    const lines = hunk.lines
    assert.equal(lines.length, 3)

    let i = 0
    assert.equal(lines[i].text, '@@ -1 +1 @@')
    assert.equal(lines[i].type, DiffLineType.Hunk)
    assert(lines[i].oldLineNumber === null)
    assert(lines[i].newLineNumber === null)
    assert.equal(lines[i].noTrailingNewLine, false)
    i++

    assert.equal(lines[i].text, '-foo')
    assert.equal(lines[i].type, DiffLineType.Delete)
    assert.equal(lines[i].oldLineNumber, 1)
    assert(lines[i].newLineNumber === null)
    assert.equal(lines[i].originalLineNumber, 1)
    assert.equal(lines[i].noTrailingNewLine, true)
    i++

    assert.equal(lines[i].text, '+foo')
    assert.equal(lines[i].type, DiffLineType.Add)
    assert(lines[i].oldLineNumber === null)
    assert.equal(lines[i].newLineNumber, 1)
    assert.equal(lines[i].originalLineNumber, 2)
    assert.equal(lines[i].noTrailingNewLine, false)
    i++
  })

  it('parses diffs where neither file version has a trailing newline', () => {
    // echo -n 'foo' >  test
    // git add -A && git commit -m foo
    // echo -n 'bar' > test
    // git diff test
    const diffText = `diff --git a/test b/test
index 1910281..ba0e162 100644
--- a/test
+++ b/test
@@ -1 +1 @@
-foo
\\ No newline at end of file
+bar
\\ No newline at end of file
`
    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    assert.equal(diff.hunks.length, 1)

    const hunk = diff.hunks[0]
    assert.equal(hunk.unifiedDiffStart, 0)
    assert.equal(hunk.unifiedDiffEnd, 2)

    const lines = hunk.lines
    assert.equal(lines.length, 3)

    let i = 0
    assert.equal(lines[i].text, '@@ -1 +1 @@')
    assert.equal(lines[i].type, DiffLineType.Hunk)
    assert(lines[i].oldLineNumber === null)
    assert(lines[i].newLineNumber === null)
    assert.equal(lines[i].noTrailingNewLine, false)
    i++

    assert.equal(lines[i].text, '-foo')
    assert.equal(lines[i].type, DiffLineType.Delete)
    assert.equal(lines[i].oldLineNumber, 1)
    assert(lines[i].newLineNumber === null)
    assert.equal(lines[i].originalLineNumber, 1)
    assert.equal(lines[i].noTrailingNewLine, true)
    i++

    assert.equal(lines[i].text, '+bar')
    assert.equal(lines[i].type, DiffLineType.Add)
    assert(lines[i].oldLineNumber === null)
    assert.equal(lines[i].newLineNumber, 1)
    assert.equal(lines[i].originalLineNumber, 2)
    assert.equal(lines[i].noTrailingNewLine, true)
    i++
  })

  it('parses binary diffs', () => {
    const diffText = `diff --git a/IMG_2306.CR2 b/IMG_2306.CR2
new file mode 100644
index 0000000..4bf3a64
Binary files /dev/null and b/IMG_2306.CR2 differ
`
    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    assert.equal(diff.hunks.length, 0)
    assert(diff.isBinary)
  })

  it('parses diff of empty file', () => {
    // To produce this output, do
    // touch foo
    // git diff --no-index --patch-with-raw -z -- /dev/null foo
    const diffText = `new file mode 100644
index 0000000..e69de29
`

    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    assert.equal(diff.hunks.length, 0)
  })

  it('parses hunk headers with omitted line counts from new file', () => {
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
    assert.equal(diff.hunks.length, 1)

    const hunk = diff.hunks[0]
    assert.equal(hunk.header.oldStartLine, 0)
    assert.equal(hunk.header.oldLineCount, 0)
    assert.equal(hunk.header.newStartLine, 1)
    assert.equal(hunk.header.newLineCount, 1)
  })

  it('parses hunk headers with omitted line counts from old file', () => {
    const diffText = `diff --git a/testste b/testste
new file mode 100644
index 0000000..f13588b
--- /dev/null
+++ b/testste
@@ -1 +0,0 @@
-asdfasdf
`

    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    assert.equal(diff.hunks.length, 1)

    const hunk = diff.hunks[0]
    assert.equal(hunk.header.oldStartLine, 1)
    assert.equal(hunk.header.oldLineCount, 1)
    assert.equal(hunk.header.newStartLine, 0)
    assert.equal(hunk.header.newLineCount, 0)
  })
})
