# Syntax Highlighted Diffs

We introduced syntax highlighted diffs in [#3101](https://github.com/desktop/desktop/pull/3101).

<img width="578" alt="A screenshot of GitHub Desktop showing a diff with syntax highlighting" src="https://user-images.githubusercontent.com/634063/31934229-d2ffdac8-b8ab-11e7-84e7-1bb2c0e1a0ec.png">

## Supported languages

We currently support syntax highlighting for the following languages and file types.

JavaScript, JSON, TypeScript, Coffeescript, HTML, Asp, JavaServer Pages, CSS, SCSS, LESS, VUE, Markdown, Yaml, XML, Diff, Objective-C, Scala, C#, Java, C, C++, Kotlin, Ocaml, F#, Swift, sh/bash, SQL, CYPHER, Go, Perl, PHP, Python, Ruby, Clojure, Rust, Elixir, Haxe, R, PowerShell, Visual Basic, Fortran, Lua, Luau, Crystal, Julia, sTex, SPARQL, Stylus, Soy, Smalltalk, Slim, HAML, Sieve, Scheme, ReStructuredText, RPM, Q, Puppet, Pug, Protobuf, Properties, Apache Pig, ASCII Armor (PGP), Oz, Pascal, Toml, Dart, CMake, Zig and Docker.

This list was never meant to be exhaustive, we expect to add more languages going forward but this seemed like a good first step.

Note, however that this list is likely to grow stale so I'd recommend checking [the code](https://github.com/desktop/desktop/blob/development/app/src/highlighter/index.ts) directly.

### I want to add my favorite language

Cool! As long as it's a language that [CodeMirror supports out of the box](https://codemirror.net/mode/index.html) or it has a module that extends CodeMirror ([`codemirror-mode-elixir`](https://github.com/optick/codemirror-mode-elixir) is an example of this) we should be able to make it work. Open an issue and we'll take it from there.

If you want to create a PR and add highlighter support for your favourite programming language don't forget to:
1. Submit a PR with a sample file for the language to [desktop/highlighter-tests](https://github.com/desktop/highlighter-tests).
2. Add the language that the highlighter going to support to the `Supported Languages` list above.

## Why do the diffs on GitHub.com and Desktop look different

GitHub.com uses TextMate/Atom grammars whereas GitHub Desktop currently uses the [built-in](https://codemirror.net/mode/index.html) modes in CodeMirror. There's some significant differences both in granularity and in tokenization between these two. CodeMirror was a good way for us to get started but depending on how it plays out we might consider looking into other grammars.

## The Problem

Syntax highlighting is a well-understood problem with tons of options. Atom uses TextMate grammars to do theirs but since we're already using CodeMirror I took a stab at implementing ours using that.

Syntax highlighted diffs have been a much appreciated feature of GitHub.com for a long time now and one that I have missed in GitHub Desktop for a long time. Highlighting in diffs presents some added complexity over that of highlighting in a normal source file though. Pretty much all languages are contextual, in that what happened on some line "higher up" affects what's going on further down. As such you can't just pull out a line from a diff and expect it to be highlighted properly. Here's a good example

<img width="658" alt="A screenshot of GitHub Desktop showing a diff with a multi-line comment which is missing the opening statement" src="https://user-images.githubusercontent.com/634063/31782735-34dfe412-b4fc-11e7-8d79-46a949417ed2.png">

Had we just tried to highlight individual lines here we wouldn't have been able to infer that the first line was part of a multi-line comment.

Instead, we have to take the contents of the file before the change, and the contents of it after and run highlighting on both versions. Once that's done we can stitch these together to form one syntax highlighted diff.


## The Approach

When we are about to perform highlighting on a diff we start out by scanning through the diff to figure out which lines we need from which file. Context lines can be pulled from either version while added/removed lines obviously need to come from a particular version. If we find that a file consists entirely of additions or entirely of deletions we can optimize further by adding a preference for one of the versions and thus getting away with loading just one file.

Once we've got that settled we load the first 256kb from both versions (256kb picked arbitrarily because I figured it should cover the majority of source files while adding a very manageable memory overhead for the feature). We then pass this content, along with which lines we want to get tokens for to one or two web workers which then run the modes. CodeMirror modes are synchronous but running them in a web worker means we can get on with other things while we're tokenizing up to half a megabyte of content in up to two different threads (threads in javascript, what have we come to). It also means that we have a real nice containment of the highlighting process and that we can terminate it should it for some reason end up taking a very long time to complete.

When we get the results from the workers we apply our own custom CodeMirror mode which takes the tokens from the language modes and applies them inside of our diff. That means that there's a small window in between when users see the diff and when highlighting gets applied. In my testing it's barely noticeable and it means we can deliver what really matters (the diff) as quickly as we've done before.
