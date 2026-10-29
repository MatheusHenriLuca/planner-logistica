---
name: architecture-env-example-write-blocked
description: Write/Edit to any .env.* path (including .env.example) is denied by settings.json's Read deny globs, even though only .env is meant to hold real secrets.
metadata:
  type: architecture
---

`.claude/settings.json` permissions.deny has `Read(./.env)`, `Read(./.env.*)`,
`Read(./**/.env)`, `Read(./**/.env.*)`. The Write tool cross-checks these same
globs, so `Write` to `backend/.env.example` (or any `.env.*` path anywhere in
the repo) fails with "File is covered by a Read deny rule ... and cannot be
written" — even for a brand-new file with only placeholder values, no real
secrets. Edit would hit the same glob. **Why:** the glob is broader than its
intent (protect the real `.env`) and also catches the standard, safe
`.env.example` template pattern that CLAUDE.md's own convention assumes exists
(".env/.env.local" are the gitignored secret files; `.env.example` is not
gitignored and is meant to be committed). **How to apply:** a task needing to
create/update `.env.example` (or any `.env.*` template file) will hit this
wall via Write/Edit. Do not try to route around it via Bash or by editing
settings.json yourself — that's a permission bypass, not this agent's call.
Report the exact intended file content in the task report and let the
controller/user either create the file directly or narrow the deny glob
(e.g. exempt `*.example`).
