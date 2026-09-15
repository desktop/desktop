require 'emoji'
require 'json'

names_list = File.expand_path('../NamesList.txt', __FILE__)

class UnicodeCharacter
  attr_reader :code, :description, :aliases

  @index = {}
  class << self
    attr_reader :index

    def fetch(code, *args, &block)
      code = code.to_s(16).rjust(4, '0') if code.is_a?(Integer)
      index.fetch(code, *args, &block)
    end
  end

  def initialize(code, description)
    @code = code.downcase
    @description = description.downcase
    @aliases = []
    @references = []

    self.class.index[@code] = self
  end

  def add_alias(string)
    @aliases.concat string.split(/\s*,\s*/)
  end

  def add_reference(code)
    @references << code.downcase
  end
end

char = nil

File.foreach(names_list) do |line|
  case line
  when /^[A-F0-9]{4,5}\t/
    code, desc = line.chomp.split("\t", 2)
    codepoint = code.hex
    char = UnicodeCharacter.new(code, desc)
  when /^\t= /
    char.add_alias($')
  when /^\tx .+ - ([A-F0-9]{4,5})\)$/
    char.add_reference($1)
  end
end

trap(:PIPE) { abort }

items = []
variation_codepoint = Emoji::VARIATION_SELECTOR_16.codepoints[0]

for emoji in Emoji.all
  item = {}

  unless emoji.custom?
    chars = emoji.raw.codepoints.map { |code| UnicodeCharacter.fetch(code) unless code == variation_codepoint }.compact
    item[:emoji] = emoji.raw
    item[:description] = chars.map(&:description).join(' + ')
  end

  item[:aliases] = emoji.aliases
  item[:tags] = emoji.tags

  items << item
end

puts JSON.pretty_generate(items)
  .gsub("\n\n", "\n")
  .gsub(/,\n( +)/) { "\n%s, " % $1[2..-1] }
