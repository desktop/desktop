#!/bin/bash
set -e

if type -p bundle >/dev/null; then
  bundle install --path vendor/bundle
  bundle binstub rake
else
  echo "You must \`gem install bundler\` first." >&2
  exit 1
fi
