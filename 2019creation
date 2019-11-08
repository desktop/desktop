Markdown
========

Version 1.0.1 - Tue 14 Dec 2004

by John Gruber  
<http://daringfireball.net/>


Introduction
------------

Markdown is a text-to-HTML conversion tool for web writers. Markdown
allows you to write using an easy-to-read, easy-to-write plain text
format, then convert it to structurally valid XHTML (or HTML).

Thus, "Markdown" is two things: a plain text markup syntax, and a
software tool, written in Perl, that converts the plain text markup 
to HTML.

Markdown works both as a Movable Type plug-in and as a standalone Perl
script -- which means it can also be used as a text filter in BBEdit
(or any other application that supporst filters written in Perl).

Full documentation of Markdown's syntax and configuration options is
available on the web: <http://daringfireball.net/projects/markdown/>.
(Note: this readme file is formatted in Markdown.)



Installation and Requirements
-----------------------------

Markdown requires Perl 5.6.0 or later. Welcome to the 21st Century.
Markdown also requires the standard Perl library module `Digest::MD5`. 


### Movable Type ###

Markdown works with Movable Type version 2.6 or later (including 
MT 3.0 or later).

1.  Copy the "Markdown.pl" file into your Movable Type "plugins"
    directory. The "plugins" directory should be in the same directory
    as "mt.cgi"; if the "plugins" directory doesn't already exist, use
    your FTP program to create it. Your installation should look like
    this:

        (mt home)/plugins/Markdown.pl

2.  Once installed, Markdown will appear as an option in Movable Type's
    Text Formatting pop-up menu. This is selectable on a per-post basis.
    Markdown translates your posts to HTML when you publish; the posts
    themselves are stored in your MT database in Markdown format.

3.  If you also install SmartyPants 1.5 (or later), Markdown will offer
    a second text formatting option: "Markdown with SmartyPants". This
    option is the same as the regular "Markdown" formatter, except that
    automatically uses SmartyPants to create typographically correct
    curly quotes, em-dashes, and ellipses. See the SmartyPants web page
    for more information: <http://daringfireball.net/projects/smartypants/>

4.  To make Markdown (or "Markdown with SmartyPants") your default
    text formatting option for new posts, go to Weblog Config ->
    Preferences.

Note that by default, Markdown produces XHTML output. To configure
Markdown to produce HTML 4 output, see "Configuration", below.


### Blosxom ###

Markdown works with Blosxom version 2.x.

1.  Rename the "Markdown.pl" plug-in to "Markdown" (case is
    important). Movable Type requires plug-ins to have a ".pl"
    extension; Blosxom forbids it.

2.  Copy the "Markdown" plug-in file to your Blosxom plug-ins folder.
    If you're not sure where your Blosxom plug-ins folder is, see the
    Blosxom documentation for information.

3.  That's it. The entries in your weblog will now automatically be
    processed by Markdown.

4.  If you'd like to apply Markdown formatting only to certain posts,
    rather than all of them, see Jason Clark's instructions for using
    Markdown in conjunction with Blosxom's Meta plugin:
    
    <http://jclark.org/weblog/WebDev/Blosxom/Markdown.html>


### BBEdit ###

Markdown works with BBEdit 6.1 or later on Mac OS X. (It also works
with BBEdit 5.1 or later and MacPerl 5.6.1 on Mac OS 8.6 or later.)

1.  Copy the "Markdown.pl" file to appropriate filters folder in your
    "BBEdit Support" folder. On Mac OS X, this should be:

        BBEdit Support/Unix Support/Unix Filters/

    See the BBEdit documentation for more details on the location of
    these folders.

    You can rename "Markdown.pl" to whatever you wish.

2.  That's it. To use Markdown, select some text in a BBEdit document,
    then choose Markdown from the Filters sub-menu in the "#!" menu, or
    the Filters floating palette



Configuration
-------------

By default, Markdown produces XHTML output for tags with empty elements.
E.g.:

    <br />

Markdown can be configured to produce HTML-style tags; e.g.:

    <br>


### Movable Type ###

You need to use a special `MTMarkdownOptions` container tag in each
Movable Type template where you want HTML 4-style output:

    <MTMarkdownOptions output='html4'>
        ... put your entry content here ...
    </MTMarkdownOptions>

The easiest way to use MTMarkdownOptions is probably to put the
opening tag right after your `<body>` tag, and the closing tag right
before `</body>`.

To suppress Markdown processing in a particular template, i.e. to
publish the raw Markdown-formatted text without translation into
(X)HTML, set the `output` attribute to 'raw':

    <MTMarkdownOptions output='raw'>
        ... put your entry content here ...
    </MTMarkdownOptions>


### Command-Line ###

Use the `--html4tags` command-line switch to produce HTML output from a
Unix-style command line. E.g.:

    % perl Markdown.pl --html4tags foo.text

Type `perldoc Markdown.pl`, or read the POD documentation within the
Markdown.pl source code for more information.



Bugs
----

To file bug reports or feature requests please send email to:
<markdown@daringfireball.net>.



Version History
---------------

1.0.1 (14 Dec 2004):

+	Changed the syntax rules for code blocks and spans. Previously,
	backslash escapes for special Markdown characters were processed
	everywhere other than within inline HTML tags. Now, the contents
	of code blocks and spans are no longer processed for backslash
	escapes. This means that code blocks and spans are now treated
	literally, with no special rules to worry about regarding
	backslashes.

	**NOTE**: This changes the syntax from all previous versions of
	Markdown. Code blocks and spans involving backslash characters
	will now generate different output than before.

+	Tweaked the rules for link definitions so that they must occur
	within three spaces of the left margin. Thus if you indent a link
	definition by four spaces or a tab, it will now be a code block.
	
		   [a]: /url/  "Indented 3 spaces, this is a link def"

		    [b]: /url/  "Indented 4 spaces, this is a code block"
	
	**IMPORTANT**: This may affect existing Markdown content if it
	contains link definitions indented by 4 or more spaces.

+	Added `>`, `+`, and `-` to the list of backslash-escapable
	characters. These should have been done when these characters
	were added as unordered list item markers.

+	Trailing spaces and tabs following HTML comments and `<hr/>` tags
	are now ignored.

+	Inline links using `<` and `>` URL delimiters weren't working:

		like [this](<http://example.com/>)

+	Added a bit of tolerance for trailing spaces and tabs after
	Markdown hr's.

+	Fixed bug where auto-links were being processed within code spans:

		like this: `<http://example.com/>`

+	Sort-of fixed a bug where lines in the middle of hard-wrapped
	paragraphs, which lines look like the start of a list item,
	would accidentally trigger the creation of a list. E.g. a
	paragraph that looked like this:

		I recommend upgrading to version
		8. Oops, now this line is treated
		as a sub-list.

	This is fixed for top-level lists, but it can still happen for
	sub-lists. E.g., the following list item will not be parsed
	properly:

		+	I recommend upgrading to version
			8. Oops, now this line is treated
			as a sub-list.

	Given Markdown's list-creation rules, I'm not sure this can
	be fixed.

+	Standalone HTML comments are now handled; previously, they'd get
	wrapped in a spurious `<p>` tag.

+	Fix for horizontal rules preceded by 2 or 3 spaces.

+	`<hr>` HTML tags in must occur within three spaces of left
	margin. (With 4 spaces or a tab, they should be code blocks, but
	weren't before this fix.)

+	Capitalized "With" in "Markdown With SmartyPants" for
	consistency with the same string label in SmartyPants.pl.
	(This fix is specific to the MT plug-in interface.)

+	Auto-linked email address can now optionally contain
	a 'mailto:' protocol. I.e. these are equivalent:

		<mailto:user@example.com>
		<user@example.com>

+	Fixed annoying bug where nested lists would wind up with
	spurious (and invalid) `<p>` tags.

+	You can now write empty links:

		[like this]()

	and they'll be turned into anchor tags with empty href attributes.
	This should have worked before, but didn't.

+	`***this***` and `___this___` are now turned into

		<strong><em>this</em></strong>

	Instead of

		<strong><em>this</strong></em>

	which isn't valid. (Thanks to Michel Fortin for the fix.)

+	Added a new substitution in `_EncodeCode()`: s/\$/&#036;/g; This
	is only for the benefit of Blosxom users, because Blosxom
	(sometimes?) interpolates Perl scalars in your article bodies.

+	Fixed problem for links defined with urls that include parens, e.g.:

		[1]: http://sources.wikipedia.org/wiki/Middle_East_Policy_(Chomsky)

	"Chomsky" was being erroneously treated as the URL's title.

+	At some point during 1.0's beta cycle, I changed every sub's
	argument fetching from this idiom:

		my $text = shift;

	to:

		my $text = shift || return '';

	The idea was to keep Markdown from doing any work in a sub
	if the input was empty. This introduced a bug, though:
	if the input to any function was the single-character string
	"0", it would also evaluate as false and return immediately.
	How silly. Now fixed.



Donations
---------

Donations to support Markdown's development are happily accepted. See:
<http://daringfireball.net/projects/markdown/> for details.



Copyright and License
---------------------

Copyright (c) 2003-2004 John Gruber   
<http://daringfireball.net/>   
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

* Redistributions of source code must retain the above copyright notice,
  this list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright
  notice, this list of conditions and the following disclaimer in the
  documentation and/or other materials provided with the distribution.

* Neither the name "Markdown" nor the names of its contributors may
  be used to endorse or promote products derived from this software
  without specific prior written permission.

This software is provided by the copyright holders and contributors "as
is" and any express or implied warranties, including, but not limited
to, the implied warranties of merchantability and fitness for a
particular purpose are disclaimed. In no event shall the copyright owner
or contributors be liable for any direct, indirect, incidental, special,
exemplary, or consequential damages (including, but not limited to,
procurement of substitute goods or services; loss of use, data, or
profits; or business interruption) however caused and on any theory of
liability, whether in contract, strict liability, or tort (including
negligence or otherwise) arising in any way out of the use of this
software, even if advised of the possibility of such damage.
