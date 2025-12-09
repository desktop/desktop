# frozen_string_literal: true

require 'spec_helper'

describe 'license rules' do
  licenses.each do |license|
    groups = rules.keys

    context "The #{license['title']} license" do
      groups.each do |group|
        valid_tags = rules[group].map { |r| r['tag'] }

        context "the #{group} group" do
          it 'should exist' do
            expect(license[group]).to_not be_nil
          end

          it 'should only contain valid tags' do
            extra = license[group] - valid_tags
            expect(extra).to be_empty
          end
        end
      end
    end
  end
end
