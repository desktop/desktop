# Community translation with Weblate

[Weblate](https://weblate.org/) lets people translate the site through a web UI and
opens pull requests back to this repository. The goal of this setup is that **English
stays the single source of truth** and an incomplete translation never blocks the
build — everything untranslated falls back to English.

See [TRANSLATING.md](TRANSLATING.md) for what the files contain; this page is about
wiring them to Weblate and the day-to-day flow.

## What Weblate handles, and what it doesn't

* **Translated in Weblate (YAML, string by string):** `ui.yml` (interface + home
  page), `rules.yml` (rule labels) and `licenses.yml` (license summaries). These are
  monolingual YAML — ideal for the short, reused strings where per-string status and
  change tracking pay off.
* **Translated as files (pull requests):** the per-language prose pages
  (`i18n/<lang>/about.md`, `i18n/<lang>/community.md`, `i18n/<lang>/no-permission.md`,
  `i18n/<lang>/non-software.md`). Whole-page prose reads better when edited as one file, so
  these come in as ordinary PRs (copy the English file, see TRANSLATING.md). Weblate
  can also manage them as Markdown files if you prefer a single workflow.
* **Never translated:** the legal text of licenses.

## One-time setup (by a maintainer)

Connect the Weblate project to this repository (Weblate pulls on every push and pushes
translations back as pull requests), then add one **monolingual** component per YAML
tier:

| Component | File format | File mask | Monolingual base file |
|-----------|-------------|-----------|-----------------------|
| Interface | YAML | `_data/i18n/*/ui.yml` | `_data/i18n/en/ui.yml` |
| Rule labels | YAML | `_data/i18n/*/rules.yml` | English base — see note |
| License summaries | YAML | `_data/i18n/*/licenses.yml` | English base — see note |

**Note on the rule/summary bases.** To avoid duplicating English, there is no
`en/rules.yml` or `en/licenses.yml` — English rule labels live in `_data/rules.yml`
and English summaries live in each license's front matter. Weblate's monolingual mode
needs an English base file, so either:

* generate `_data/i18n/en/rules.yml` and `_data/i18n/en/licenses.yml` from those
  canonical sources as a build/CI step and point Weblate's base at them (they remain
  generated, never hand-edited), **or**
* keep `rules.yml` / `licenses.yml` out of Weblate and accept them as ordinary pull
  requests, like the prose pages.

`ui.yml` needs neither workaround — `_data/i18n/en/ui.yml` is its own English base.

Recommended Weblate options for each component: enable "Update on push", set the
"Template for new translations" to the English base, and keep "Edit base file" off so
contributors can't change the source language.

## How updates flow

1. A maintainer changes English (e.g. edits `en/ui.yml` or an `about.md`). On push,
   Weblate pulls and **flags the affected strings as needing update** in every
   language (so translators see exactly what changed).
2. Translators update those strings in Weblate.
3. Weblate opens (or updates) a pull request with the new translations. Maintainers
   review and merge — there are no extra build steps, and a half-finished language
   still falls back to English.

## When a translation should become a pull request

* **Routine translation:** done in Weblate; it batches into a PR automatically.
* **A noticeably better translation than what's shipped:** open a normal pull request
  (or improve it in Weblate). The translations in this repo are an initial,
  AI-assisted baseline; replacing a string or a whole prose page with a clearly better
  human translation is welcome and expected.
* **A new prose page translation:** add `i18n/<lang>/about.md` (etc.) in a pull request; see
  [TRANSLATING.md](TRANSLATING.md).

## Adding a new language

1. Add the language code to `languages:` in [`_config.yml`](_config.yml) (this is what
   actually makes the site build and offer the language).
2. In Weblate, add the language to each component. Weblate creates the
   `_data/i18n/<code>/<file>.yml` files from the English template; translators fill
   them in.
3. Prose pages for the new language are added as files (`i18n/<code>/about.md`, …) when
   someone translates them; until then those pages fall back to English.

Because of the English fallback, a language can be added and translated incrementally:
nothing has to be complete before it ships.
