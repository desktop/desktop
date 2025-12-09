# frozen_string_literal: true

require 'json'
require 'open-uri'
require 'spec_helper'
require 'yaml'

describe 'ruby version' do
  pages_versions = JSON.parse(URI.open('https://pages.github.com/versions.json').read)
  pages_ruby_version = pages_versions['ruby']

  ci_config_file = '.github/workflows/test.yml'
  ci_config = YAML.load_file(ci_config_file)
  ci_ruby_version = ci_config['jobs']['test']['steps'][1]['with']['ruby-version']

  context "in #{ci_config_file} and pages ruby version" do
    it 'match' do
      msg = "#{ci_ruby_version} != #{pages_ruby_version}; please add a commit bumping in #{ci_config_file}"
      expect(ci_ruby_version).to eql(pages_ruby_version), msg
    end
  end

  rubocop_config_file = '.rubocop.yml'
  rubocop_config = YAML.load_file(rubocop_config_file)
  rubocop_ruby_version = rubocop_config['AllCops']['TargetRubyVersion']
  pages_ruby_version_minor = pages_ruby_version.match('^(\d+)\.(\d+)')[0]

  context "in #{rubocop_config_file} and pages ruby minor version" do
    it 'match' do
      msg = "#{rubocop_ruby_version} != #{pages_ruby_version_minor}; please add a commit bumping in #{rubocop_config_file}"
      expect(rubocop_ruby_version.to_s).to eql(pages_ruby_version_minor), msg
    end
  end
end
