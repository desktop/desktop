# frozen_string_literal: true

require 'spec_helper'

context 'licensee detects this project' do
  let(:detected) { Licensee.project('.').license }

  it 'license as MIT' do
    expect(detected.key).to eq('mit')
  end
end
