# Data-Contract Dictionary: Federal Secure Identity Registry (Anon Model)

## 1. Scope & Context
- **System Role**: Backend data-contract layer for a modular J2EE web platform (Oracle DB).
- **Volume**: ~400 DB entities (fields, types, PK/FK, nullability, indexes).
- **Focus**: Anonymized core domains (`CORE_PERSON`, `CORE_ORG`, `ADDR_HIERARCHY`, `CASE_FLOW`, `DOC_SCAN`, `SIG_RULE`, `AUDIT_LOG`).
- **Classifiers**: Hierarchical + faceted dictionaries, coding rules (sequential/parallel), versioned locking via `VERSION`.
- **FLC Binding**: Format-Logical Controls mapped to UI validation rules at the data layer.

## 2. Artifact Structure (Docs-as-Code)
- **Entity Dictionary**: Markdown tables per entity (columns, types, keys, constraints).
- **FK Map**: Cross-reference matrix of external keys.
- **Glossary**: PK / FK / EMD / FLC / Optimistic Lock definitions.
- **Changelog**: Versioned release tags.

## 3. Key Constraint (Scope Note)
- **Not** a UI description.
- Pure **data-contract** layer: every FK encodes a control rule.
- Level: Security Documentation Engineer / data model governance.
- One-liner: `400-table Oracle schema → navigable FLC-bound data contracts.`
