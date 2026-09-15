# frozen_string_literal: true

require 'spec_helper'

describe 'byte order marks' do
  Dir["#{licenses_path}/*.txt"].each do |file|
    context "the #{File.basename(file, '.txt')} license" do
      it 'does not begin with a byte order mark' do
        bom = File.read(file).start_with?("\u0000EF\u0000BB\u0000BF")
        msg = 'License file begins with a Byte Order Mark. See https://stackoverflow.com/a/1068700.'
        expect(bom).to eql(false), msg
      end
    end
  end
end
