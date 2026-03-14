# Research-Design-Plan-Implement Framework

A `Research-Design-Plan-Implement` (`RDPI`) workflow for AI-assisted software development with human-in-the-loop checkpoints.
This document serves as a reference for both AIs and humans, ensuring quality through structured research, planning, and implementation phases, each with AI self-review and human approval gates.

Main goals of context engineering:

- maximize correctness and completeness
- minimize context size and noise
- enforce quality gates before code moves forward

## Overview

All work for a feature or change happens in a dedicated workflow folder (e.g., `.ai-workflow/<feature-slug>/`).
Each workflow folder has a corresponding git branch and pull request, keeping code changes tied to their documentation.

This framework implements context engineering as a repeatable delivery process:

1. Research narrows scope with factual evidence from parallel specialist agents.
2. Design defines target architecture, contracts, and test strategy via a parallel design team.
3. Plan splits work into self-contained phase files with inlined context and exact gate commands.
4. Implement executes each phase with a coder agent and parallel reviewer team.
5. Validate confirms conformance to plan and design with parallel phase validators.

### Responses

Coding boundary:

- `Research`, `Design`, `Plan`, and `Validate` are artifact-focused phases and do not write product code.
- Product code is written only in `Implement`.
- `Implement` can start only after explicit human approval to begin code changes.

## Structure

```
.claude/
  agents/
    ...
  commands/
    ...

.ai-workflow/
  <feature-slug>/
    research/
      YYYY-MM-DD_<slug>.research.md (e.g. 2026-02-26_supabase_implementation.research.md)
      ...
    design/
      README.md
      NN-<type>.design.md (e.g. 01-architecture.design.md)
      ...
    plan/
      README.md
      phase-NN.plan.md (e.g. phase-01.plan.md)
      ...
    implement-notes/
      phase-NN.notes.md (e.g. phase-01.notes.md)
      ...
```

## Workflow

Each AI step should start a fresh session with context limited to the relevant workflow folder files.
This practice of scoping AI context to specific artifacts is called Context Engineering—it keeps sessions focused and prevents context pollution across phases.

### 0) Before start

- Before start workflow need to create a new branch with name provided :<feature slug>

### 1) Research (`/research`)

**Description**: Understand the codebase, the files relevant to the issue, and how information flows, and perhaps potential causes of a problem.

**Goal**: Document the codebase as-is. No critique, no recommendations.

- Spawn agents team team in parallel:
  - Agent A: entry points and core logic
  - Agent B: data models and persistence
  - Agent C: API/event interfaces
  - (+ auth, config, tests as warranted by scope)
- Produces **fact-only as-is** artifact with required sections

Output: `.ai-workflow/<feature-slug>/research/YYYY-MM-DD_<slug>.md`

Required sections:

1. Task Input (verbatim)
2. Scope and Assumptions
3. Entity Map (As-Is) — every component with file:line
4. Runtime Data Flow (As-Is) — numbered steps with file:line
5. Interfaces and Contracts (As-Is) — complete, not summarized
6. Constraints and Risks Observed (As-Is) — no recommendations
7. Gaps Against Task
8. Code References (exhaustive bullet list)
9. Context Budget — Include / Optional / Exclude

**Gate**: Artifact has all 9 sections; no recommendations present.

### 2) Design (`/design`)

**Description**: Design the system architecture, data flow, interfaces, and contracts for the target solution.

**Goal**: Define target solution, architecture, contracts, and test strategy(opinionated).

- Spawns parallel design team `design/`. Test member needed only if required
- Produces several files design package under `.ai-workflow/<feature-slug>/design`

Outputs (files in `.ai-workflow/<feature-slug>/design/`):

- `README.md` — index + approval gate
- `01-architecture.design.md` — ADR-lite decisions, cite research file:line
- `02-data-flow.design.md` — success + fallback paths
- `03-sequence.design.md` — mermaid sequences: main + error path
- `04-contracts.design.md` — complete API/event/schema definitions
- `05-test-strategy.design.md` — test matrix mapped to components (opinionated)

**Gate**: Requires explicit `APPROVED` before planning begins.

### 3) Plan (`/plan`)

**Description**: Outline the exact steps we'll take to fix the issue, and the files we'll need to edit and how, being super precise about the testing / verification steps in each phase.

**Goal**: Split work into self-contained atomic phase files with inlined context.

- Reads all design files, produces one self-contained phase file per phase detailing the changes we plan to make given decisions
- Each phase file inlines all context — no "see design" references
- Contracts pasted verbatim; gate commands are exact (no placeholders)

Output: `.ai-workflow/<feature-slug>/plan/phase-NN.plan.md` per phase + `README.md` index

Per-phase required sections:

1. Goal
2. Context (inlined; no “see design” references)
3. Files to Create or Modify
4. Implementation Steps (with acceptance check per step)
5. Embedded Contracts (verbatim copy — not a link)
6. Validation Gates (exact commands — no placeholders)
7. Deliverable
8. Risk Checklist

**Gate**: Requires explicit `APPROVED` before implementation begins.

### 4) Implement (`/implement`)

**Description**: Step through the plan, phase by phase. For complex work,we can compact the current status to implementation notes into the `.ai-workflow/<feature-slug>/implement-notes/phase-NN.notes.md` file after each implementation phase is verified.

**Goal**: Implement one phase strictly from the phase file.

Agents:

- `implement-coder` — writes code from phase file only
- `implement-reviewer-quality` — PASS | FAIL
- `implement-reviewer-security` — PASS | FAIL
- `implement-reviewer-conformance` — PASS | FAIL

- Work with ONE phase at once
- Reads ONE phase file; spawns `implement-coder` agent
- Runs Validation Gates, then spawns parallel reviewer team `reviewers/`
- Blocks advancement until all three reviewers return PASS
- Starts only after explicit human signal to begin code changes (e.g. `APPROVED TO IMPLEMENT`)

**Rule**: all three reviewers must PASS before phase is marked complete.
**Rule**: Drift Protocol triggers on any plan/reality mismatch — pause for human approval.
**Rule**: next phase starts only after explicit human signal (`APPROVED TO IMPLEMENT` or equivalent).

### 5) Validate (`/validate`)

- Spawns parallel validators: one `phase-validator` per phase + security + conformance
- Produces PASS / PASS_WITH_DEVIATIONS / FAIL report with release readiness verdict

## Coding Boundary

- `Research`, `Design`, `Plan`, and `Validate` are artifact phases (no product code edits).
- Only `Implement` writes product code.
- `Implement` starts only after explicit human approval to implement.

## Artifact Handoff Model

Each artifact is exhaustive enough that the next phase never needs to read backward:

- `Research` → `.ai-workflow/<feature-slug>/research/YYYY-MM-DD_<slug>.md` (as-is, no recommendations)
- `Design` → `.ai-workflow/<feature-slug>/design/<slug>/` (target solution + approval gate)
- `Plan` → `.ai-workflow/<feature-slug>/plan/phase-NN.md` per phase (self-contained, contracts inlined)
- `Implement` → product code + phase file updated to `status: complete`
- `Validate` → conformance report with PASS/FAIL verdict inline

## Key Design Decisions

**Why self-contained artifacts?**
Each phase output embeds all facts the next phase needs. No agent reads backward.
This eliminates context drift and makes phases independently reviewable.

**Why feedback loops?**
Code quality problems discovered during review should fix the root cause —
either the implementation or the plan — not be worked around.

**Why mandatory security review?**
Security issues discovered after merging are expensive. Every phase gets a
dedicated security reviewer before advancing.

**Why multi-model?**
Discovery work (find files, read code) doesn't need frontier reasoning.
Architectural decisions and plan authoring do. Separating them cuts cost
without sacrificing quality where it matters.
