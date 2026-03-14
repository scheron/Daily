---
description: Implements technical plans phase files one by one with phase validation and three parallel reviewer gates. Feedback loop routes failures back to the correct phase.
model: opus
---

# Implement Plan

You are tasked with implementing an approved technical plan from `.ai-workflow/<feature-slug>/plan/`.
These plans contain phases with specific changes and success criteria.
Each phase gets implemented, validated, and reviewed before advancing.

## Getting Started

When given a plan path:

- Read the plan completely and check for any existing checkmarks (- [x])
- Read the original ticket and all files mentioned in the plan
- **Read files fully** - never use limit/offset parameters, you need complete context
- Think deeply about how the pieces fit together
- Create a todo list to track your progress
- Start implementing if you understand what needs to be done

If no plan path provided, ask for one.

## Implementation Philosophy

Plans are carefully designed, but reality can be messy. Your job is to:

- Follow the plan's intent while adapting to what you find
- Implement each phase fully before moving to the next
- Verify your work makes sense in the broader codebase context
- Update checkboxes in the plan as you complete sections

When things don't match the plan exactly, think about why and communicate clearly. The plan is your guide, but your judgment matters too.

If you encounter a mismatch:

- STOP and think deeply about why the plan can't be followed
- Present the issue clearly:

  ```
  Issue in Phase [N]:
  Expected: [what the plan says]
  Found: [actual situation]
  Why this matters: [explanation]

  How should I proceed?
  ```

## If You Get Stuck

When something isn't working as expected:

- First, make sure you've read and understood all the relevant code
- Consider if the codebase has evolved since the plan was written
- Present the mismatch clearly and ask for guidance

Use sub-tasks sparingly - mainly for targeted debugging or exploring unfamiliar territory.

## Resuming Work

If the plan has existing checkmarks:

- Trust that completed work is done
- Pick up from the first unchecked item
- Verify previous work only if something seems off

**Remember**: You're implementing a solution, not just checking boxes. Keep the end goal in mind and maintain forward momentum.

## For Each Phase File (in ascending order)

### Step 1: Load Phase

Read the phase file fully; read all referenced files fully.

### Step 2: Implement

Spawn `implement-coder` sub-agent with full phase context:

**If implement-coder returns `## IMPLEMENTATION STOPPED`:**

```
IMPLEMENTATION BLOCKED
Phase {N}, Step {S}: {stop reason}

{implement-coder's STOP block verbatim}

Options:
  RESUME    — I'll continue after you clarify the question above
  SKIP      — defer this phase and move to next
  ABORT     — stop implementation entirely
```

Wait for human signal before continuing.

### Step 3: Phase Validate

Spawn `phase-validator` with:

- Phase file content
- implement-coder's completion report

**If phase-validator returns FAIL:**

```
PHASE VALIDATION FAILED — Phase {N}

{phase-validator's failure report verbatim}

Options:
  RESUME    — fix manually then say RESUME
  SKIP      — accept current state with failures noted, move to next phase
  ABORT     — stop implementation
```

Wait for human signal.

### Step 4: Review Gate (parallel)

Spawn all three reviewers simultaneously:

- `implement-reviewer-quality`
- `implement-reviewer-security`
- `implement-reviewer-conformance`

All three receive: phase file content + implement-coder's report + current contents
of all files modified.

### Step 5: Feedback Loop

Initialize `iteration = 0`.

While any reviewer returned FAIL AND `iteration < 3`:
`iteration++`

Collect all ISSUE blocks from failing reviewers.

For each ISSUE where `Route To: implement-coder`: 1. Spawn `implement-coder` with: phase file + ISSUE block + current file contents 2. Spawn `phase-validator` to verify the fix 3. If phase-validator FAIL: report and wait (do not re-run reviewers yet) 4. If phase-validator PASS: continue

For each ISSUE where `Route To: plan-author`: 1. Spawn `plan-author` with: original phase file + ISSUE block (instruction: revise the phase file) 2. Spawn `plan-validator` on the revised phase file 3. If plan-validator INVALID: report to human 4. If plan-validator VALID: - Update the saved phase file in thoughts/shared/plans/{slug}/ - Restart from Step 2 (re-implement from the revised plan) - Reset `iteration = 0`

After all ISSUEs addressed: re-spawn all three reviewers simultaneously.

**If `iteration >= 3` and reviewers still FAIL:**

```
FEEDBACK LIMIT REACHED — Phase {N}

After 3 iterations, unresolved issues remain:
{list of still-failing reviewer results}

Options:
  RESUME    — fix manually, then say RESUME to re-run reviewers
  OVERRIDE  — accept current state (issues logged, advancement forced)
  ABORT     — stop implementation
```

Wait for human signal.

### Step 6: Phase Complete

When all three reviewers return PASS:

```
Phase {N} COMPLETE — {title}
All gates passed: quality ✓ security ✓ conformance ✓
```

Proceed to Phase {N+1}.

---

## After All Phases Complete

```
## Implementation Complete

| Phase | Title           | Iterations | Result   |
|-------|-----------------|------------|----------|
| 1     | Data Models     | 1          | PASS     |
| 2     | Auth Service    | 2          | PASS     |
| 3     | Auth Controller | 1          | PASS     |

All phases complete. Run final validation:
  /validate
```
