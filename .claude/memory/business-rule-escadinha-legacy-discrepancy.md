---
name: escadinha-shift-times-and-lunch-break-confirmed
description: Shift-start times are confirmed as requisitos.md's values (Python legacy's alternate constants are drift, not authoritative); a +40min lunch-break insertion is a confirmed required rule, with user-approved placeholder meal times pending manual tuning.
metadata:
  type: business-rule
---

The escadinha cascade's core recurrence (`Hora Inicial[n] = Hora Final[n-1]` on the same posto, STATUS=2 only) is confirmed in both legacy PowerApps and Python source. Two details that diverged between the two legacy implementations are now resolved:

- **Shift-start times**: 06:20 / 14:40 / 23:00 (turnos 1/2/3) — matches `requisitos.md` and legacy PowerApps. The Python legacy's alternate constants (06:00 / 14:40 / 22:40) are undocumented drift, not authoritative — do not use them.
- **Lunch-break insertion**: confirmed as a real required rule for the new system (user request, 2026-08-24), not just a Python-only legacy experiment. Mechanism: if an item's production window crosses its shift's meal time, add +40min to that item's `Hora Final` once — later items inherit the delay for free through the normal escadinha chaining, so the addition must happen exactly once per shift/posto, not per item. Whenever applied, the item's card must visibly show `"HORARIO DE ALMOCO INCLUSO"`.
- **Meal-break clock times are placeholders** the user explicitly asked to be filled in with a reasonable default (formula used: shift start + 4h) since they don't recall the real values and will hand-tune later: turno 1 → 10:20, turno 2 → 18:40, turno 3 → 03:00. Documented in `CLAUDE.md` Conventions — update both places if the user provides real values later.

**Why:** found via a full `code-archaeologist` line-level comparison of both legacy implementations, then resolved directly with the user rather than left as an open question.

**How to apply:** implement the cascade using the confirmed 06:20/14:40/23:00 shift starts, plus the lunch-break addition using the placeholder meal times above — structure the meal times as an easily-editable constant/config (not buried in logic), since the user is expected to change them.
