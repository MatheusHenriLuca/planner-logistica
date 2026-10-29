---
name: patan-format-confirmed-single-letter
description: Patan is a single letter A–H, confirmed by the user — not an 8-character code, despite CLAUDE.md/requisitos.md prose and a legacy dossier note suggesting otherwise.
metadata:
  type: business-rule
---

**Confirmed by the user (2026-08-24):** Patan is, and always was, a single letter. It ranges A–H; the programador submits exactly one letter per request. It is not a multi-character code.

This resolves a real conflict found during legacy archaeology: `CLAUDE.md`'s original Convention and `requisitos.md` both stated "Patan is 8 characters," while the reviewed legacy code (`montar_patan_logic.py`) treated `letra_patan` as one atomic value with zero string-slicing logic anywhere in `Script-PowerApps.txt` (2847 lines) or the Python. A separate dossier note about a historical "4→8 letters" Patan migration turned out to describe a different SharePoint/Excel column, not this system's Patan field.

**Why this matters:** `CLAUDE.md`'s Convention section has been corrected to match (single letter A–H). If any other doc under `requisitosBases/` (e.g. `requisitos.md`'s "8 caracteres" line) is edited later, reconcile it against this confirmed answer, not the other way around — this is the user's direct word, it outranks the written spec prose.

**How to apply:** implement Patan as a single-character enum/choice type (A–H) everywhere — request payloads, routing, the `seq{letter}` column selection pattern the legacy code already used. No fixed-width parsing/slicing logic needed for it at all.
