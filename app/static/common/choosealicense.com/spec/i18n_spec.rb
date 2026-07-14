# frozen_string_literal: true

require 'spec_helper'

# These checks guard the internationalization layer without ever requiring a
# translation to be complete: missing strings fall back to English at build time.
# They catch the mistakes that *would* silently break a page — a template asking
# for a key that doesn't exist, or a translation file using an unknown key/id.
describe 'i18n' do
  let(:i18n) { site.data['i18n'] }
  let(:base) { i18n['en']['ui'] }
  let(:license_ids) { licenses.map { |l| l['spdx-lcase'] } }

  it 'ships an English base UI file' do
    expect(base).to be_a(Hash)
    expect(base).not_to be_empty
  end

  it 'has only string values in the English base UI file' do
    non_strings = base.reject { |_key, value| value.is_a?(String) }.keys
    expect(non_strings).to be_empty, "non-string en/ui.yml keys: #{non_strings.join(', ')}"
  end

  it 'defines every statically-referenced UI key in the English base' do
    globs = ['_includes/**/*.html', '_layouts/**/*.html', '*.html', '*.md']
    files = globs.flat_map { |glob| Dir.glob(File.expand_path(glob, source)) }
    referenced = files.flat_map do |file|
      File.read(file).scan(/\binclude\s+t(?:md)?\.html\s+key=["']([a-z0-9_]+)["']/).flatten
    end.uniq
    missing = referenced - base.keys
    expect(missing).to be_empty, "templates reference UI keys missing from en/ui.yml: #{missing.join(', ')}"
  end

  translation_langs = Dir.glob(File.expand_path('_data/i18n/*/ui.yml', source))
                         .map { |path| File.basename(File.dirname(path)) } - ['en']

  translation_langs.each do |lang|
    context "the '#{lang}' UI translation" do
      let(:translation) { i18n[lang]['ui'] }

      it 'only uses keys that exist in the English base' do
        orphans = translation.keys - base.keys
        expect(orphans).to be_empty, "#{lang}/ui.yml has keys absent from en/ui.yml: #{orphans.join(', ')}"
      end
    end
  end

  Dir.glob(File.expand_path('_data/i18n/*/licenses.yml', source)).each do |path|
    lang = File.basename(File.dirname(path))

    context "the '#{lang}' license summaries" do
      let(:summaries) { i18n[lang]['licenses'] }

      it 'is keyed only by known license ids' do
        unknown = summaries.keys - license_ids
        expect(unknown).to be_empty, "#{lang}/licenses.yml references unknown licenses: #{unknown.join(', ')}"
      end
    end
  end

  Dir.glob(File.expand_path('_data/i18n/*/rules.yml', source)).each do |path|
    lang = File.basename(File.dirname(path))

    context "the '#{lang}' rule labels" do
      let(:translated_rules) { i18n[lang]['rules'] }

      %w[permissions conditions limitations].each do |group|
        it "only references known #{group} tags" do
          group_rules = translated_rules[group]
          next if group_rules.nil?

          valid = rules[group].map { |rule| rule['tag'] }
          unknown = group_rules.keys - valid
          expect(unknown).to be_empty, "#{lang}/rules.yml '#{group}' has unknown tags: #{unknown.join(', ')}"
        end
      end
    end
  end
end
