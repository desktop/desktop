# frozen_string_literal: true

require 'spec_helper'

# Popular licenses that are shown (non-hidden)
# Note: most new licenses that are added should be hidden by default
SHOWN_LICENSES = %w[
  agpl-3.0
  apache-2.0
  bsd-2-clause
  bsd-3-clause
  bsl-1.0
  cc0-1.0
  epl-2.0
  gpl-2.0
  gpl-3.0
  lgpl-2.1
  mit
  mpl-2.0
  unlicense
].freeze

describe 'shown licenses' do
  it 'has the expected number of shown licenses' do
    expect(shown_licenses.count).to eql(13)
    expect(SHOWN_LICENSES.count).to eql(shown_licenses.count)
  end

  shown_licenses.each do |license|
    context "the #{license['title']} license" do
      it 'is whitelisted to be shown' do
        expect(SHOWN_LICENSES).to include(license['spdx-lcase'])
      end
    end
  end
end
