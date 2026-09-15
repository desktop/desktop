#!/bin/bash
# Usage: script/release
#
# 1. Checks if tests pass,
# 2. commits gemspec,
# 3. tags the release with the version in the gemspec,
# 4. pushes "gemoji" gem to RubyGems.org.

set -e

case "$1" in
-h | --help )
  sed -ne '/^#/!q;s/.\{1,2\}//;1d;p' < "$0"
  exit 0
  ;;
esac

if git diff --quiet gemoji.gemspec; then
  echo "You must bump the version in the gemspec first." >&2
  exit 1
fi

script/test

trap 'rm *.gem' EXIT

version="$(gem build gemoji.gemspec | awk '/Version:/ { print $2 }')"
git commit gemoji.gemspec Gemfile.lock -m "gemoji $version"
git tag "v${version}"
git push origin HEAD "v${version}"
gem push "gemoji-${version}.gem"
