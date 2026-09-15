# frozen_string_literal: true

require 'spec_helper'

describe 'word wrapping' do
  licenses.each do |license|
    context "the #{license['slug']} license" do
      it 'wraps at line length 78' do
        max_line = license['content'].lines.max_by { |line| line.chomp!.length }
        msg = "Longest line is #{max_line.length} characters: #{max_line}"
        expect(max_line.length).to be <= 78, msg
      end
    end
  end
end
