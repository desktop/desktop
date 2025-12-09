# frozen_string_literal: true

require 'jekyll'
require 'json'
require 'licensee'
require 'open-uri'

module SpecHelper
  class << self
    attr_accessor :config, :licenses, :site, :spdx,
                  :osi_approved_licenses, :fsf_approved_licenses, :od_approved_licenses
  end
end

def config_file
  File.expand_path './_config.yml', source
end

def source
  File.expand_path('../', File.dirname(__FILE__))
end

def licenses_path
  File.expand_path '_licenses', source
end

def config
  SpecHelper.config ||= begin
    config = Jekyll::Configuration.new.read_config_file config_file
    config = Jekyll::Utils.deep_merge_hashes(config, source: source)
    Jekyll::Utils.deep_merge_hashes(Jekyll::Configuration::DEFAULTS, config)
  end
end

def licenses
  SpecHelper.licenses ||= site.collections['licenses'].docs.map do |license|
    spdx_lcase = File.basename(license.basename, '.txt')
    license.to_liquid.merge('spdx-lcase' => spdx_lcase)
  end
end

def shown_licenses
  licenses.reject { |l| l['hidden'] }
end

def site
  SpecHelper.site ||= begin
    site = Jekyll::Site.new(config)
    site.reset
    site.read
    site
  end
end

def rules
  site.data['rules']
end

def fields
  site.data['fields']
end

def meta
  site.data['meta']
end

def rule?(tag, group)
  rules[group].any? { |r| r['tag'] == tag }
end

def spdx_list
  SpecHelper.spdx ||= begin
    url = 'https://spdx.org/licenses/licenses.json'
    list = JSON.parse(OpenURI.open_uri(url).read)['licenses']
    list.each_with_object({}) do |values, memo|
      memo[values['licenseId']] = values
    end
  end
end

def spdx_ids
  spdx_list.map { |name, _properties| name }
end

def find_spdx(license)
  spdx_list.find { |name, _properties| name.casecmp(license).zero? }
end

def osi_approved_licenses
  SpecHelper.osi_approved_licenses ||= begin
    licenses = {}
    list = spdx_list.select { |_id, meta| meta['isOsiApproved'] }
    list.each do |id, meta|
      licenses[id.downcase] = meta['name']
    end
    licenses
  end
end

def fsf_approved_licenses
  SpecHelper.fsf_approved_licenses ||= begin
    url = 'https://wking.github.io/fsf-api/licenses-full.json'
    object = JSON.parse(OpenURI.open_uri(url).read)
    licenses = {}
    object['licenses'].each_value do |meta|
      next unless meta.dig('identifiers', 'spdx') && (meta.include? 'tags') && (meta['tags'].include? 'libre')

      meta['identifiers']['spdx'].each do |identifier|
        licenses[identifier.downcase] = meta['name']
      end
    end
    licenses
  end
end

def od_approved_licenses
  SpecHelper.od_approved_licenses ||= begin
    url = 'https://licenses.opendefinition.org/licenses/groups/od.json'
    data = OpenURI.open_uri(url).read
    data = JSON.parse(data)
    licenses = {}
    data.each do |id, meta|
      licenses[id.downcase] = meta['title']
    end
    licenses
  end
end

def approved_licenses
  (osi_approved_licenses.keys + fsf_approved_licenses.keys + od_approved_licenses.keys).flatten.uniq.sort
end

module Licensee
  class License
    class << self
      def license_dir
        dir = ::File.dirname(__FILE__)
        ::File.expand_path '../_licenses', dir
      end

      def spdx_dir
        ::File.expand_path '../license-list-XML/src', __dir__
      end
    end
  end
end
