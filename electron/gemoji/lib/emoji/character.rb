module Emoji
  class Character
    # Inspect individual Unicode characters in a string by dumping its
    # codepoints in hexadecimal format.
    def self.hex_inspect(str)
      str.codepoints.map { |c| c.to_s(16).rjust(4, '0') }.join('-')
    end

    # True if the emoji is not a standard Emoji character.
    def custom?() !raw end

    # A list of names uniquely referring to this emoji.
    attr_reader :aliases

    def name() aliases.first end

    def add_alias(name)
      aliases << name
    end

    # A list of Unicode strings that uniquely refer to this emoji.
    attr_reader :unicode_aliases

    # Raw Unicode string for an emoji. Nil if emoji is non-standard.
    def raw() unicode_aliases.first end

    def add_unicode_alias(str)
      unicode_aliases << str
    end

    # A list of tags associated with an emoji. Multiple emojis can share the
    # same tags.
    attr_reader :tags

    def add_tag(tag)
      tags << tag
    end

    def initialize(name)
      @aliases = Array(name)
      @unicode_aliases = []
      @tags = []
    end

    def inspect
      hex = '(%s)' % hex_inspect unless custom?
      %(#<#{self.class.name}:#{name}#{hex}>)
    end

    def hex_inspect
      self.class.hex_inspect(raw)
    end

    attr_writer :image_filename

    def image_filename
      if defined? @image_filename
        @image_filename
      else
        default_image_filename
      end
    end

    private

    def default_image_filename
      if custom?
        '%s.png' % name
      else
        'unicode/%s.png' % hex_inspect.sub(/-fe0f\b/, '')
      end
    end
  end
end
