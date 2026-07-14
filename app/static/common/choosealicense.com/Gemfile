# frozen_string_literal: true

source 'https://rubygems.org'

gem 'jekyll', '~> 4.3'

# Jekyll plugins listed in _config.yml
gem 'jekyll-github-metadata', '~> 2.16'
gem 'jekyll-redirect-from', '~> 0.16'
gem 'jekyll-seo-tag', '~> 2.8'
gem 'jekyll-sitemap', '~> 1.4'

# Internationalization. Not on the GitHub Pages plugin whitelist, so the site is
# built and deployed from GitHub Actions (.github/workflows/deploy.yml) rather than
# by the native Pages build.
gem 'jekyll-polyglot', '~> 1.5'

# https://github.com/jekyll/jekyll/issues/8523
gem 'webrick', '~> 1.7'

group :development do
  gem 'colored'
  gem 'fuzzy_match'
  gem 'terminal-table'
end

group :test do
  gem 'html-proofer', '~> 5.0'
  gem 'licensee', git: 'https://github.com/licensee/licensee.git', branch: 'master'
  gem 'rake'
  gem 'rspec'
  gem 'rubocop'
  gem 'safe_yaml', '~> 1.0'
end
