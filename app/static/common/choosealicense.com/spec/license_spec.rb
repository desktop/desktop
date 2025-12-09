# frozen_string_literal: true

require 'spec_helper'

describe 'licenses' do
  it 'matches the number of files in the _licenses folder' do
    expect(licenses.count).to eql(Dir["#{licenses_path}/*.txt"].count)
  end

  licenses.each do |license|
    context "The #{license['title']} license" do
      let(:spdx_lcase) { license['spdx-lcase'] }
      let(:spdx_id) { license['spdx-id'] }

      it 'has an SPDX ID' do
        expect(spdx_ids).to include(spdx_id)
      end

      it 'has an ID that is downcased SPDX ID' do
        expect(spdx_id.casecmp(spdx_lcase).zero?)
      end

      it 'uses its SPDX name' do
        spdx = find_spdx(spdx_id)
        expect(spdx).to_not be_nil
        expect(spdx[1]['name'].gsub(/ only$/, '')).to eql(license['title'])
      end

      context 'industry approval' do
        it 'should be approved by OSI or FSF or OD' do
          expect(approved_licenses).to include(spdx_lcase), 'See https://github.com/github/choosealicense.com/blob/gh-pages/CONTRIBUTING.md#adding-new-licenses.'
        end
      end

      context 'minimum permissions' do
        let(:permissions) { license['permissions'] }
        it 'should allow commercial use' do
          expect(permissions).to include('commercial-use')
        end

        it 'should allow modification' do
          expect(permissions).to include('modifications')
        end

        it 'should allow distribution' do
          expect(permissions).to include('distribution')
        end

        it 'should allow private use' do
          expect(permissions).to include('private-use')
        end
      end
    end
  end
end
