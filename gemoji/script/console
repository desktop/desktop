#!/bin/bash
set -e

public_methods() {
  sed '/^ *private/,$d' "$1" | grep -w def | sed -E 's/^ *def /  /; s/).+/)/'
}

echo "Emoji methods:"
public_methods lib/emoji.rb
echo
echo "Emoji::Character methods:"
public_methods lib/emoji/character.rb
echo

exec irb -I lib -r emoji
