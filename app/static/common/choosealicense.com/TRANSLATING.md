# Translating choosealicense.com

The site can be displayed in several languages. The default language (English)
lives at the site root (e.g. `/licenses/mit/`); every other language is served
under its own prefix (e.g. `/fr/licenses/mit/`) by
[jekyll-polyglot](https://github.com/untra/polyglot). Anything that isn't
translated yet **automatically falls back to English**, so a partial translation
never breaks the build.

**The legally meaningful text of a license is never translated** (see below).

## What gets translated, and where

| What | Where | Who |
|------|-------|-----|
| **Interface** — buttons, menus, headings, rule labels, the home page sections | `_data/i18n/<lang>/ui.yml` and `_data/i18n/<lang>/rules.yml` (keyed strings) | Anyone fluent in the language |
| **Prose pages** — About, Community, No License, Non-Software | a per-language Markdown file, e.g. `i18n/fr/about.md` | Anyone fluent in the language |
| **License summaries** (no legal value) — the `description` / `how` / `note` shown *about* a license | `_data/i18n/<lang>/licenses.yml` | Someone comfortable with licensing concepts |
| **License legal text** — the body of `_licenses/*.txt` | — | **Nobody — never translated** |

There are two kinds of source on purpose: short, reused strings (and the
data-driven home page and appendix) are **keys** in `ui.yml`, where per-string
tracking helps; whole prose pages are **per-language Markdown files**, where a
translator can edit one readable file and restructure the prose to read naturally
in their language.

### Why the legal text is off-limits

A license's operative text is the English (or official) version. Some licenses have
official or semi-official translations with their own status, and downstream tooling
such as [licensee](https://github.com/licensee/licensee) keys off the canonical
text. Translating it here would be misleading and could have legal consequences, so
the legal text is always shown as-is.

## English is the single source of truth

* **UI strings:** `_data/i18n/en/ui.yml`
* **Rule labels:** `_data/rules.yml`
* **License summaries:** each license's front matter in `_licenses/*.txt`
* **Prose pages:** the un-suffixed file (e.g. `about.md`)

Nothing English is duplicated per language. Other languages only provide what they
translate; everything else falls back to English.

## Adding or updating a translation

### Interface, rule labels, license summaries (YAML)

Edit (or create) `_data/i18n/<lang>/ui.yml`, and optionally
`_data/i18n/<lang>/rules.yml` and `_data/i18n/<lang>/licenses.yml`. These are flat,
monolingual YAML — see [WEBLATE.md](WEBLATE.md) to do it through Weblate.

### A prose page (one Markdown file per language)

Copy the English page and translate it:

```
cp about.md i18n/<lang>/about.md
```

Then, in `i18n/<lang>/about.md`:

* set `lang: <lang>` in the front matter,
* keep the same `permalink:`,
* translate `title:` and `description:` — these become the localized `<title>`, meta
  description and Open Graph tags,
* translate the body (keep links and anchors such as `#for-users` intact).

If a language has no file for a page, that language simply shows the English page.

### Adding a brand-new language

1. Add the language code to `languages:` in [`_config.yml`](_config.yml).
2. Create `_data/i18n/<code>/ui.yml` (copy `_data/i18n/en/ui.yml` and translate the
   values; keep the keys).
3. Optionally add `_data/i18n/<code>/licenses.yml` and `_data/i18n/<code>/rules.yml`.
4. Optionally add the per-language prose pages (`i18n/<code>/about.md`, `i18n/<code>/community.md`,
   `i18n/<code>/no-permission.md`, `i18n/<code>/non-software.md`).

So a new language is **one line in `_config.yml` + 1–3 small YAML files + one Markdown
file per prose page you choose to translate** — and anything you skip falls back to
English.

### Keys (YAML)

* `ui.yml` keys are flat. Keys ending in `_html` contain raw HTML; everything else is
  Markdown. Keep links and anchors (e.g. `#for-users`) intact.
* Placeholders like `%title%`, `%projects%`, `%license%`, `%language%` are filled in by
  the site — keep them.
* `licenses.yml` is keyed by the lowercased SPDX id (e.g. `mit`, `gpl-3.0`).
* `rules.yml` mirrors `_data/rules.yml`: `<group>` → `<tag>` → `{ label, description }`.

A lightweight test (`spec/i18n_spec.rb`) checks that translations only use keys that
exist in English and that license/rule ids are valid. It does **not** require
translations to be complete.

## Community translation with Weblate

The YAML tiers are ready for community translation via Weblate, and the per-language
Markdown pages are translated as files. See **[WEBLATE.md](WEBLATE.md)** for the
component setup, how source updates are detected and pulled, when to open a pull
request, and how to add a language on the Weblate side.

## Notes for template authors (polyglot gotchas)

If you edit the templates that build the multilingual links, two non-obvious
[polyglot](https://github.com/untra/polyglot) behaviours can bite — both are already
handled in the codebase, so just don't undo them:

* **Placeholders use `%name%`, not `%{name}`.** They're substituted with Liquid's
  `replace` filter (e.g. `{{ s | replace: '%title%', license.title }}`). A `}` in a
  `replace` argument is read as the end of the `{{ … }}` tag and breaks the build, so
  the brace-free `%name%` form is used everywhere (UI strings, `replace` calls, JS).
* **In `hreflang` `<link>` tags, write `href` before `hreflang`.** Polyglot rewrites
  internal URLs per language but deliberately skips any link matching
  `hreflang="<default_lang>" href=…`. With the reverse order the default language's
  alternate would ship polyglot's internal `ferh=` placeholder instead of `href=`.
  See the comment in [`_includes/header.html`](_includes/header.html).

Also note: polyglot is not a GitHub Pages plugin, so its tags (e.g. `static_href`)
only resolve when the site is built outside Pages' safe mode — i.e. via the Actions
workflow or a local `jekyll serve`/`build`, never the native Pages build.
