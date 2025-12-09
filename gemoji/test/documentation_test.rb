require 'test_helper'

# Pull the EmojiHelper example from the docs
readme = File.expand_path('../../README.md', __FILE__)
docs = File.open(readme, 'r:UTF-8') { |f| f.read }
eval docs.match(/^module.+?^end/m)[0]

String.class_eval do
  def html_safe() self end
  def present?() !empty? end
end

class DocumentationTest < TestCase
  module Helper
    extend EmojiHelper

    def self.h(str)
      str.gsub('<', '&lt;').gsub('>', '&gt;')
    end

    def self.image_path(img)
      "/images/#{img}?123"
    end
  end

  test "replaces emoji syntax with images" do
    assert_equal "It's raining " \
        '<img alt="cat" src="/images/emoji/unicode/1f431.png?123" style="vertical-align:middle" width="20" height="20" />s and ' \
        '<img alt="dog" src="/images/emoji/unicode/1f436.png?123" style="vertical-align:middle" width="20" height="20" />s!',
      Helper.emojify("It's raining :cat:s and :dog:s!")
  end

  test "doesn't replace unknown emoji" do
    content = ":jupiter: is in :space:"
    assert_equal content, Helper.emojify(content)
  end

  test "escapes other HTML" do
    assert_equal "You have been &lt;script&gt;alert('pwned!')&lt;/script&gt;",
      Helper.emojify("You have been <script>alert('pwned!')</script>")
  end

  test "returns nil for blank content" do
    assert_nil Helper.emojify('')
  end
end
