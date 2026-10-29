---
name: prefer-stated-assumptions-over-askuserquestion
description: User prefers Claude state stack/architecture assumptions directly in text (with rationale) rather than blocking via AskUserQuestion for framework/DB-type decisions.
metadata:
  type: feedback
---

User rejected an `AskUserQuestion` call (FastAPI vs Django, PostgreSQL vs SQL Server) and immediately re-sent the original request verbatim instead of answering it. Treat this as: for stack/architecture-type open decisions, state the pick + one-line rationale directly in prose and move forward, rather than invoking the interactive question tool.

**Why:** the rejection + identical re-send is a clear signal the user wants forward progress, not a picker UI, for this class of decision.

**How to apply:** applies to framework/library/architecture choices where a sensible default exists and the cost of being wrong is a quick correction, not to genuinely irreversible or destructive actions (those still warrant confirmation per the project's "Executing actions with care" guidance). If the user explicitly asks something with multiple valid answers, still present the options — just do it in prose, not via `AskUserQuestion`.
