desc "Copy emoji to the Rails `public/images/emoji` directory"
task :emoji do
  require 'emoji'

  target = "#{Rake.original_dir}/public/images"
  `mkdir -p '#{target}' && cp -Rp '#{Emoji.images_path}/emoji' '#{target}'`
end
