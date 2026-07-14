# Translations live in two trees

To work with Jekyll (which separates *data* from rendered *pages*), each language's
translation is split across two mirrored trees:

- `_data/i18n/<lang>/` — interface strings, rule labels and license summaries
  (keyed YAML: `ui.yml`, `rules.yml`, `licenses.yml`).
- `i18n/<lang>/` — the translated prose pages (About, Community, No License,
  Non-Software), one Markdown file per page.

English is the single source of truth; anything untranslated falls back to English.
See `TRANSLATING.md` and `WEBLATE.md` at the repository root.
