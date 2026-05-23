# Basil Project Agent + Memory Migration — Design

**Date:** 2026-05-23
**Status:** Approved (pending spec review)

## Goal

Stand up a project-specific custom agent ("basil") for the animated-space-waffle
repo, following the user's documented agent architecture
(`claude-code-agent-architecture.md`), and **migrate the existing per-project
auto-memory into the agent's manual memory files**. The agent and its memory live
in the repo (version-controlled) so context travels with the project and is enforced
by git history.

## Background

The architecture doc was built for a *strategy* agent that fetched Notion docs and
kept a separate manual memory file — because that project had no other memory layer.
Basil is different: it already has a rich auto-memory system
(`~/.claude/projects/-Users-chris-Projects-animated-space-waffle/memory/` — a
`MEMORY.md` index + ~30 fact files), plus `CLAUDE.md`, `DESIGN.md`, `BRAND.md`, and
5 path-scoped rule files in `.claude/rules/`. The migration consolidates the
auto-memory into the agent's manual memory and disables auto-memory so the two
systems don't run in parallel and drift.

## Decisions (locked)

1. **Location:** project-level / version-controlled (in `.claude/`), not user-level.
2. **Model:** `opus`.
3. **Auto-memory disable:** in committed `.claude/settings.json` (not `settings.local.json`).
4. **Working modes:** Build a feature · Fix a bug · Design/UI work · Debug · Scope new work.
5. **Memory model:** migrate auto-memory → manual agent memory; disable auto-memory.

## File layout

```
.claude/
├── agents/
│   └── basil.md                  # agent definition (frontmatter + system prompt)
├── agent-memory/
│   └── basil/
│       ├── MEMORY.md             # active memory — read at every session start
│       └── HISTORY.md            # shipped/resolved items — read on demand
├── settings.json                 # NEW (committed): { "autoMemoryEnabled": false }
├── settings.local.json           # unchanged (hooks, permissions — gitignored)
└── rules/                        # unchanged (auto-load by path)
```

## Component 1 — Agent definition (`.claude/agents/basil.md`)

Markdown file, YAML frontmatter = config, body = system prompt. Structure adapted
from architecture doc §6, re-flavored for code work.

**Frontmatter:**
- `name: basil`
- `description:` when to delegate — "Primary development agent for the Basil budgeting
  app (animated-space-waffle). Use for any feature, bugfix, design, or debugging work
  in this repo."
- `model: opus`
- `color:` a display color (e.g. green — basil).
- **No `allowedTools` restriction** — this is a full-capability dev agent (needs
  Read/Edit/Write/Bash/Grep/Glob/Agent/Skill/AskUserQuestion/WebFetch/WebSearch and
  the task tools). Omitting the field grants the default full toolset; restricting
  risks excluding something a build task needs.
- No `memory:` frontmatter field (we use the *manual* memory pattern, not built-in).

**Body sections:**
1. **Session Start** — before responding: (a) read `.claude/agent-memory/basil/MEMORY.md`;
   (b) note what changed since last session (2-3 sentences); (c) address the request.
   `CLAUDE.md` and `.claude/rules/` auto-load, so the agent does not re-fetch them.
2. **Core context (always available)** — `MEMORY.md`, `CLAUDE.md`, `.claude/rules/`.
3. **Known docs (fetch on demand)** — `DESIGN.md` (before any UI work), `BRAND.md`,
   `plans/`, `docs/superpowers/specs|plans/`, `HISTORY.md`.
4. **Working modes** — Build a feature · Fix a bug · Design/UI work · Debug · Scope
   new work. Each gives the agent a short behavioral frame.
5. **Memory maintenance** — keep `MEMORY.md` honest; archive shipped/resolved threads
   to `HISTORY.md`; record dated entries in the Decisions Log; age-track open threads.
6. **Principles** (pulled from existing rules so they're enforced): search before
   building; reuse Basil components & shared utilities; check deployment artifacts
   when adding/moving dirs; verify before claiming done; explain jargon (user is not
   an engineer by trade). Superpowers process skills still apply (brainstorm before
   building, systematic debugging, TDD).
7. **`teardown` command** — exit sequence: doc-drift check, memory update (decisions
   + open threads + status), 2-3 line summary.

## Component 2 — Memory files

**`MEMORY.md` (active, read every session)** — sections from architecture doc §4,
adapted:
- **Working Agreements** — how the agent behaves (from `user_*` + `feedback_*`).
- **Document Map** — what docs exist and how changes cascade (CLAUDE.md, DESIGN.md,
  BRAND.md, rules, plans, specs) + reference/fragile areas.
- **Open Threads → Active** (age-tracked) — in-progress work.
- **Open Threads → Recently Resolved** — staging before archival.
- **Decisions Log** — dated entries with rationale.

**`HISTORY.md` (on demand)** — archived shipped/resolved threads and superseded
decisions, kept out of active context to stay lean (doc §14: target active memory
< ~150 lines).

## Component 3 — Migration mapping

Consolidate the existing auto-memory into the new files. Categorization:

| Existing source | Destination |
|---|---|
| `user_non_engineer.md`, all `feedback_*.md` (deployment, dev-env, debugging, iOS, component-library, CSS, never-overwrite-memory, vaul-retro, e2e-regression) | `MEMORY.md` → **Working Agreements** |
| `project_pfc_detail_mapping.md`, `project_plaid_id_reconciliation.md`, `feedback_mobile_table.md`, production-infra notes | `MEMORY.md` → **Document Map / Reference & Fragile Areas** |
| Active `project_*`: recurring-patterns-engine, teller-migration, pfc-smart-suggestions, basil-uat-progress, basil-library-migration, dialog-prop-reactivity, custom-date-picker, custom-keyboard-followups, BasilTray-shouldDrag | `MEMORY.md` → **Open Threads → Active** |
| Shipped `project_*`: basil-tray-vaul-rewrite, transaction-drilldown, monospace-removed, animation-tokens, shared-utility-extraction, keyboard-123-button, quasar-migration, db-migration (Hetzner go-live) | `HISTORY.md` + dated **Decisions Log** entries |

Exact placement of each file is finalized during implementation by reading each
source file in full.

## Safety & verification (critical)

The user's standing rule: *"Never overwrite memory files — previous session content
may not exist anywhere else."* Therefore:

- Migration **copies** content into the new structure. It does not move or delete.
- The old auto-memory directory is **left fully intact** as a backup.
- Before declaring done, verify **every** source file's content landed somewhere in
  `MEMORY.md` or `HISTORY.md` (explicit per-file checklist).
- Nothing in the old auto-memory dir is edited, renamed, or removed.

## Component 4 — Cutover

- Create committed `.claude/settings.json` with `{ "autoMemoryEnabled": false }` so
  the harness stops auto-loading/writing the old per-project memory. (`autoMemoryEnabled`
  is a valid project-settings key; `autoMemoryDirectory` is the only auto-memory key
  ignored in committed project settings, and we don't use it.)
- Provide the shell alias line for the user to add to `~/.zshrc`:
  `alias basil='claude --agent basil --name basil'`. **Not** written automatically —
  shell config is the user's to change.

## Trade-off accepted

Agent memory only loads when launched as the agent (`claude --agent basil` / `basil`
alias). Bare `claude` in this repo will no longer auto-load memory. The user accepts
this; the workflow becomes "open the Basil agent to work on Basil."

## Non-goals

- No deletion or editing of the existing auto-memory directory.
- No changes to `CLAUDE.md`, `DESIGN.md`, `BRAND.md`, or `.claude/rules/` content.
- No multi-agent coordination layer (single agent; cascade rules N/A for now).
- No cross-machine sync beyond what git already provides.

## Verification checklist

- [ ] `.claude/agents/basil.md` valid frontmatter; agent appears in `/agents`.
- [ ] `.claude/agent-memory/basil/MEMORY.md` and `HISTORY.md` exist and are well-formed.
- [ ] Every auto-memory source file is represented in MEMORY.md or HISTORY.md.
- [ ] `.claude/settings.json` parses; `autoMemoryEnabled: false` present.
- [ ] Old auto-memory directory unchanged (byte-identical to pre-migration).
- [ ] Alias line provided to user (not auto-applied).
