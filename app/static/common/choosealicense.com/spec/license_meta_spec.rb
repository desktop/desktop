# frozen_string_literal: true

require 'spec_helper'

describe 'license meta' do
  licenses.each do |license|
    # Manually load the raw license so we don't get the defaults
    raw_fields = SafeYAML.load_file("_licenses/#{license['spdx-lcase']}.txt")

    context "The #{license['title']} license" do
      it 'should only contain supported meta fields' do
        extra_fields = raw_fields.keys - (meta.map { |m| m['name'] })
        expect(extra_fields).to be_empty
      end

      it 'should contain all required meta fields' do
        required = meta.select { |m| m['required'] }.map { |m| m['name'] }
        missing = required - raw_fields.keys
        expect(missing).to be_empty
      end

      examples = raw_fields['using'] || {}

      it 'using contains 3 examples' do
        legacy = [
          'afl-3.0',
          'artistic-2.0',
          'bsd-3-clause-clear',
          'eupl-1.1',
          'lgpl-2.1',
          'lgpl-3.0',
          'lppl-1.3c',
          'ms-pl',
          'ms-rl',
          'wtfpl'
        ]
        skip 'added before 3 using examples required' if legacy.include?(license['slug'])
        expect(examples.length).to eq(3)
      end

      context 'licensee detects using examples' do
        slug = license['slug']

        examples.each_value do |example_url|
          context "the #{example_url} URL" do
            let(:content)  { OpenURI.open_uri(example_url).read }
            let(:detected) { Licensee::ProjectFiles::LicenseFile.new(content, 'LICENSE').license }

            if example_url.start_with?('https://github.com/')
              example_url.gsub!(%r{\Ahttps://github.com/([\w-]+/[\w.-]+)/blob/(\S+)\z}, 'https://raw.githubusercontent.com/\1/\2')
            elsif example_url.start_with?('https://git.savannah.gnu.org/', 'https://git.gnome.org/', 'https://code.qt.io')
              example_url.gsub!(%r{/tree/}, '/plain/')
            elsif example_url.start_with?('https://bitbucket.org/')
              example_url.gsub!(%r{/src/}, '/raw/')
            elsif example_url.start_with?('https://ohwr.org/')
              example_url.gsub!(%r{/blob/}, '/raw/')
            end

            it "is a #{slug} license" do
              skip 'hard to detect licenses' if %(ncsa postgresql vim).include?(slug) && detected.key == 'other'
              expect(detected.key).to eq(slug)
            end
          end
        end
      end
    end
  end
end
