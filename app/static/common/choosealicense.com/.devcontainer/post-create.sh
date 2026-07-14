#!/usr/bin/env bash
set -euo pipefail

for cmd in git tr; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "${cmd} is required for .devcontainer/post-create.sh"
    exit 1
  fi
done

if command -v apt-get >/dev/null 2>&1; then
  packages=(
    build-essential
    cmake
    pkg-config
    libffi-dev
    libyaml-dev
    libssl-dev
    zlib1g-dev
    libreadline-dev
    libgdbm-dev
    libncurses-dev
    libssh2-1-dev
  )

  missing_packages=()
  for package in "${packages[@]}"; do
    if ! dpkg-query -W -f='${Status}' "${package}" 2>/dev/null | grep -q 'install ok installed'; then
      missing_packages+=("${package}")
    fi
  done

  if [[ ${#missing_packages[@]} -gt 0 ]]; then
    echo "Installing Ruby build dependencies: ${missing_packages[*]}"
    if command -v sudo >/dev/null 2>&1; then
      sudo apt-get update
      sudo apt-get install -y "${missing_packages[@]}"
    else
      apt-get update
      apt-get install -y "${missing_packages[@]}"
    fi
  fi
fi

echo "Initializing/updating git submodules"
git submodule update --init --recursive

ruby_version_file=".ruby-version"
if [[ ! -f "${ruby_version_file}" ]]; then
  echo "Could not find ${ruby_version_file}"
  exit 1
fi

repo_ruby_version="$(tr -d '[:space:]' < "${ruby_version_file}")"
echo "Repository Ruby version: ${repo_ruby_version}"

if [[ -z "${repo_ruby_version}" ]]; then
  echo "Could not determine Ruby version from ${ruby_version_file}"
  exit 1
fi

if [[ ! -d "$HOME/.rbenv" ]]; then
  git clone --depth 1 https://github.com/rbenv/rbenv.git "$HOME/.rbenv"
fi

if [[ ! -d "$HOME/.rbenv/plugins/ruby-build" ]]; then
  mkdir -p "$HOME/.rbenv/plugins"
  git clone --depth 1 https://github.com/rbenv/ruby-build.git "$HOME/.rbenv/plugins/ruby-build"
fi

export PATH="$HOME/.rbenv/bin:$HOME/.rbenv/shims:$PATH"
eval "$(rbenv init - bash)"

rbenv install -s "${repo_ruby_version}"
rbenv global "${repo_ruby_version}"
rbenv rehash

for profile in "$HOME/.bashrc" "$HOME/.zshrc"; do
  if [[ -f "$profile" ]] && ! grep -q 'rbenv init - bash' "$profile"; then
    {
      echo
      echo '# Load rbenv'
      echo 'export PATH="$HOME/.rbenv/bin:$HOME/.rbenv/shims:$PATH"'
      echo 'eval "$(rbenv init - bash)"'
    } >> "$profile"
  fi
done

gem install bundler --no-document
rbenv rehash
mkdir -p "$HOME/.local/bin"
ln -sf "$HOME/.rbenv/shims/bundle" "$HOME/.local/bin/bundle"
bundle install
