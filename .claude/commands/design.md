---
description: Produces target architecture and API contracts from a research artifact.
model: opus
---

# Design

You orchestrate the design phase, should define target solution, architecture, contracts and interfaces.

## Rules

- Do NOT access the codebase directly — work only from the research artifact
- Spawn architect-designer and contract-designer IN PARALLEL (they work from the
  same research artifact independently)
- Every architectural decision must cite a research fact
- Wait for explicit human approval before proceeding to /plan

## Steps:

### 1: Read Research Artifact

Read the research artifact at the provided path COMPLETELY (no limit/offset).
Ensure you understand all sections before spawning agents.

### 2 — Spawn parallel design team via Task tool

Spawn 2 agents in parallel using the the same research artifact:

- **Agent A — `architect-designer`**
  Pass: full research artifact text
  Task: produce target architecture, ADR-lite decisions, open questions

- **Agent B — `contract-designer`**
  Pass: full research artifact text
  Task: produce exhaustive API/event/schema contract definitions

### 3 — Assemble design package

Read both outputs. Check for:

- Contract definitions that conflict with architectural decisions → resolve in favor of architecture
- Architectural components that lack contracts → flag as gap
- Contracts defined for components not in the architecture → flag as inconsistency

Resolve all conflicts before saving. Architecture supersedes contract details
(architecture defines WHAT exists; contracts define HOW to call it).

Combine agents outputs into 5 files under `.ai-workflow/<feature-slug>/design/`:

| File                 | Source                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| `README.md`          | Synthesize from all outputs                                            |
| `01-architecture.md` | From architect-designer                                                |
| `02-data-flow.md`    | Synthesize from architect-designer + research section 4                |
| `03-sequence.md`     | Synthesize from architect-designer + research section 4                |
| `04-contracts.md`    | From contract-designer                                                 |
| `05-risks.md`        | Synthesize from architect-designer open questions + research section 6 |

### Step 4 — Post approval gate

After all files are written, output the following **exactly**:

```
Design package created at .ai-workflow/<feature-slug>/design/
Please review and approve before I write phase files.
APPROVED       — proceed to /plan
```

Then stop. Do not proceed until the user replies APPROVED.

### 5 — On approval

When the user replies APPROVED, update `.ai-workflow/<feature_slug>/design/README.md`:
change `status: draft` to `status: approved` in the frontmatter.

## Design Package File Formats

### `README.md`

```markdown
---
date: YYYY-MM-DD
slug: <feature_slug>
task_type: feature|bugfix|refactor
research: <research_path>
status: draft
---

# Design: <task_statement>

## Overview

[2-3 sentence summary of the design approach]

## File Index

- [01-architecture.md](01-architecture.md) — ADR-lite decisions and target structure
- [02-data-flow.md](03-data-flow.md) — Data flow: success and error paths
- [03-sequence.md](04-sequence.md) — Sequence diagrams: main and error flows
- [04-contracts.md](05-contracts.md) — Exhaustive API / event / schema contracts
- [05-risks.md](06-risks.md) — Risk register

## Approval Gate

Status: **DRAFT — awaiting approval**
```

### `01-architecture.md`

Must contain:

- Target Architecture (what changes and why)
- Component Boundaries (new / changed / untouched)
- Architectural Decisions (ADR-lite) — each decision MUST cite a research fact (file:line or section)

### `02-data-flow.md`

Must contain:

- Success path data flow (numbered steps)
- Error/fallback path data flow (numbered steps)

### `03-sequence.md`

Must contain mermaid sequence diagrams:

- Main success path
- Primary error path

### `04-contracts.md`

Must contain (from contract-designer output):

- API Endpoints (all new and changed, complete schemas)
- Events/Messages (all new and changed)
- Database Schema Changes (with migration SQL and rollback SQL)
- Unchanged Contracts (explicit list)

### `05-risks.md`

Risk register format:

```
| ID   | Description | Likelihood | Impact | Mitigation |
|------|-------------|------------|--------|------------|
| R-01 | ...         | High/Med/Low | High/Med/Low | ... |
```

## Quality Gate

Verify before posting approval gate:

- [ ] All 5 files written with no empty sections
- [ ] Every architectural decision in `01-architecture.md` cites a research fact (file:line or section)
- [ ] All new/changed contracts in `05-contracts.md` are complete (no placeholders)
- [ ] Both success and error paths present in `04-sequence.md`
- [ ] `README.md` status is `draft` (not `approved`)
