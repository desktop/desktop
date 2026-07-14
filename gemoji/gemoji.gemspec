Gem::Specification.new do |s|
  s.name    = "gemoji"
  s.version = "2.1.0"
  s.summary = "Emoji conversion and image assets"
  s.description = "Image assets and character information for emoji."

  s.required_ruby_version = '> 1.9'

  s.authors  = ["GitHub"]
  s.email    = "support@github.com"
  s.homepage = "https://github.com/github/gemoji"
  s.licenses = ["MIT"]

  s.files = Dir[
    "README.md",
    "images/**/*.png",
    "db/emoji.json",
    "lib/**/*.rb",
    "lib/tasks/*.rake"
  ]
end
