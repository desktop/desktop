This project adheres to the [Open Code of Conduct][code-of-conduct]. By participating, you are expected to uphold this code.
[code-of-conduct]: http://todogroup.org/opencodeofconduct/#gemoji/opensource@github.com

Our emoji set is based off Apple's emoji character palette, plus some custom
emoji such as :octocat: :shipit: :metal:.

Some useful tools in development are:

```
script/bootstrap
```

Sets up the development environment. The prerequisites are:

* Ruby 1.9+
* Bundler

```
rake db:generate
```

On OS X, this will rebuild the `db/Category-Emoji.json` file from the system
one, pulling in any new emoji that Apple may have added in the meantime.

```
script/test
```

Runs the test suite, including the integrity test where we assert that we have
covered each of Apple's emoji.

```
script/regenerate
```

Rebuilds the `db/emoji.json` file which is our main list of emoji: their
canonical representations, descriptions, aliases, and tags. This requires OS X
because Safari is used in the process to verify which character render as emoji
and which render as ordinary Unicode glyphs from the current font.

```
script/console
```

Opens `irb` console with gemoji library preloded for experimentation.

```
script/release
```

For maintainers only: after the gemspec has been edited, this commits the
change, tags a release, and pushes it to both GitHub and RubyGems.org.
