# frozen_string_literal: true

require 'spec_helper'

describe 'license fillable fields' do
  licenses.each do |license|
    context "The #{license['title']} license" do
      it 'should only contain supported fillable fields' do
        matches = license['content'][1, 1000].scan(/\s+\[([a-z_]+)\]/)
        extra_fields = matches.flatten - (fields.map { |f| f['name'] })
        expect(extra_fields).to be_empty
      end
    end
  end
end
