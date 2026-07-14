# frozen_string_literal: true

require 'html-proofer'
require 'rspec/core/rake_task'

desc 'Run specs'
RSpec::Core::RakeTask.new do |t|
  t.pattern = 'spec/**/*_spec.rb'
  t.rspec_opts = ['--order', 'rand', '--color']
end

task :test do
  sh 'bundle exec jekyll build'
  Rake::Task['spec'].invoke
  HTMLProofer.check_directory('./_site',
                              checks: %w[Links Images Scripts],
                              check_external_hash: false,
                              enforce_https: true,
                              swap_urls: { %r{https://choosealicense.com} => '' },
                              ignore_urls: [%r{https://github.com/github/choosealicense.com/edit/gh-pages/_licenses/},
                                            %r{https://help.github.com},
                                            %r{https://opensource.org},
                                            %r{https://git.savannah.gnu.org},
                                            %r{https://www.gnu.org/licenses/license-recommendations.html}],
                              hydra: { max_concurrency: 10 }).run
end

task :approved_licenses do
  require './spec/spec_helper'
  approved = approved_licenses
  approved.select! { |l| spdx_ids.include?(l) }
  puts "#{approved.count} approved licenses:"
  puts approved.join(', ')
  puts "\n"

  potential = approved - licenses.map { |l| l['id'] }
  puts "#{potential.count} potential additions:"
  puts potential.join(', ')
end
