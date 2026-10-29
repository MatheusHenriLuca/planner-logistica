# Memory index

- [Prefer stated assumptions over AskUserQuestion](feedback-prefer-stated-assumptions.md) — user rejected the question tool once, re-sent same ask; state picks in prose instead.
- [STATUS field collision across two lists](business-rule-status-field-collision.md) — planning list STATUS (0/2/3/9) and request-list STATUS ('1'/'2') are unrelated; model as two enums.
- [SAP integration is desktop automation](architecture-sap-desktop-automation.md) — win32com against live SAP GUI, not an API; needs a separate Windows adapter, not inline in FastAPI.
- [MB52 pipeline reality](business-rule-mb52-pipeline-reality.md) — mb52.py only exports raw stock; comparison + "peça crítica" flag happen elsewhere, refresh step looks dead.
- [Escadinha shift times + lunch break confirmed](business-rule-escadinha-legacy-discrepancy.md) — 06:20/14:40/23:00 confirmed canonical; +40min lunch rule confirmed, placeholder times pending user tuning.
- [Patan format confirmed: single letter A–H](business-rule-patan-format-unconfirmed.md) — user confirmed, not an 8-char code; CLAUDE.md Convention already corrected to match.
- [.env.example write blocked by permission deny rule](architecture-env-example-write-blocked.md) — settings.json's `.env.*` Read-deny globs also block Write/Edit; report content, don't route around it.

