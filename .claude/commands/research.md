---
description: Document codebase as-is with thoughts directory for historical context
model: opus
---

# Research Codebase

You are tasked with conducting comprehensive research across the codebase to answer user questions by spawning parallel sub-agents and synthesizing their findings.

## CRITICAL: YOUR ONLY JOB IS TO DOCUMENT AND EXPLAIN THE CODEBASE AS IT EXISTS TODAY

- DO NOT suggest improvements or changes unless the user explicitly asks for them
- DO NOT perform root cause analysis unless the user explicitly asks for them
- DO NOT propose future enhancements unless the user explicitly asks for them
- DO NOT critique the implementation or identify problems
- DO NOT recommend refactoring, optimization, or architectural changes
- ONLY describe what exists, where it exists, how it works, and how entities interact
- You are creating a technical map/documentation of the existing system

## Initial Setup:

When this command is invoked, respond with:

```
I'm ready to research the codebase. Please provide your research question or area of interest, and I'll analyze it thoroughly by exploring relevant components and connections.
```

Then wait for the user's research query.

Before anything else, scan the target project for documentation and read what's
relevant. Documentation often contains architectural constraints, mandatory
conventions, and API contracts that code alone won't reveal.

**Scan for docs in this order:**

1. Root-level orientation:
   - `README.md` / `README.rst` / `README.txt`
   - `CONTRIBUTING.md` / `CONTRIBUTING.rst`
   - `ARCHITECTURE.md` / `DESIGN.md` / `OVERVIEW.md`

2. Dedicated doc directories:
   - `docs/**/*.md`, `doc/**/*.md`, `documentation/**/*.md`
   - `adr/`, `decisions/`, `rfcs/` — architectural decision records

3. API and schema specs:
   - `openapi.yaml`, `openapi.json`, `swagger.yaml`, `swagger.json`
   - `schema.prisma`, `schema.sql`, `*.graphql`
   - Any `*api*.md` files

Use Glob to find these, then read relevant files completely (no limit/offset).

## Steps to follow after receiving the research query:

1. **Read any directly mentioned files first:**
   - If the user mentions specific files (tickets, docs, JSON), read them FULLY first
   - **IMPORTANT**: Use the Read tool WITHOUT limit/offset parameters to read entire files
   - **CRITICAL**: Read these files yourself in the main context before spawning any sub-tasks
   - This ensures you have full context before decomposing the research

2. **Analyze and decompose the research question:**
   - Break down the user's query into composable research areas
   - Take time to ultrathink about the underlying patterns, connections, and architectural implications the user might be seeking
   - Identify specific components, patterns, or concepts to investigate
   - Create a research plan using TodoWrite to track all subtasks
   - Consider which directories, files, or architectural patterns are relevant

3. **Spawn parallel sub-agent tasks for comprehensive research:**
   - Create multiple Task agents to research different aspects concurrently
   - We now have specialized agents that know how to do specific research tasks:

   **For codebase research:**
   - Use the **codebase-locator** agent to find WHERE files and components live
   - Use the **codebase-analyzer** agent to understand HOW specific code works (without critiquing it)
   - Use the **codebase-pattern-finder** agent to find examples of existing patterns (without evaluating them)

   **IMPORTANT**: All agents are documentarians, not critics. They will describe what exists without suggesting improvements or identifying issues.

   **For web research (only if user explicitly asks):**
   - Use the **web-search-researcher** agent for external documentation and resources
   - IF you use web-research agents, instruct them to return LINKS with their findings, and please INCLUDE those links in your final report

   **The key is to use these agents intelligently:**
   - Start with locator agents to find what exists
   - Then use analyzer agents on the most promising findings to document how they work
   - Run multiple agents in parallel when they're searching for different things
   - Each agent knows its job - just tell it what you're looking for
   - Don't write detailed prompts about HOW to search - the agents already know
   - Remind agents they are documenting, not evaluating or improving

4. **Wait for all sub-agents to complete and synthesize findings:**
   - IMPORTANT: Wait for ALL sub-agent tasks to complete before proceeding
   - Compile all sub-agent results
   - Prioritize live codebase findings as primary source of truth
   - Connect findings across different entities
   - Include specific file paths and line numbers for reference
   - Verify all thoughts/ paths are correct
   - Highlight patterns, connections, and architectural decisions
   - Answer the user's specific questions with concrete evidence

5. **Gather metadata for the research document:**
   - Run the following command to capture the exact codebase state at research time:

   ```bash
   git branch --show-current
   ```

   - Filename: `.ai-workflow/<feature-slug or branch name>/research/YYYY-MM-DD-XXX.research.md`
     - Format: `YYYY-MM-DD-XXX.research.md` where:
       - YYYY-MM-DD is today's date
       - XXX is the feature slug if user provided or branch name
       - research is a human-readable title for the research topic
     - Example: `2025-01-08-implement_supabase.research.md`

6. **Generate research document:**
   - Use the metadata gathered in step 5
   - Structure the document with YAML frontmatter followed by content:

   ```markdown
   ---

   date: [Current date and time with timezone in ISO format]
   branch: [Current branch name from]
   status: complete

   ---

   # Research YYYY-MM-DD-XXX:

   ## Research Question

   [Original user query]

   ## Summary

   [High-level documentation of what was found, answering the user's question by describing what exists]

   ## Detailed Findings

   ### [Entity/Area 1]

   - Description of what exists ([file.ext:line](link))
   - How it connects to other components
   - Current implementation details (without evaluation)

   ### [Entity/Area 2]

   ...

   ## Code References Map (As-Is)

   [Every relevant entity with file:line. Group by layer or domain.]

   For each entity:

   - **Name**: `path/to/file.ext:start-end`
   - **Role**: factual one-line description
   - **Key dependencies**: other components it calls/imports (path:line)
   - Example:
   - `path/to/file.py:123` - Description of what's there
   - `another/file.ts:45-67` - Description of the code block

   ## Architecture Documentation

   [Current patterns, conventions, and design implementations found in the codebase]

   ## Interfaces and Contracts (As-Is)

   [Every Types, Interfaces, API endpoint, event, and schema — complete, not summarized]

   ## Code References

   [Exhaustive bullet list of every file:line cited above]

   ## Related Research

   [Links to other documents e.g docs/]

   ## Context Budget

   **Include** (essential for next phase):

   - [file or section]

   **Optional** (load if design needs it):

   - [file or section]

   **Exclude** (not relevant to this task):

   - [file or section]
   ```

## Important notes:

- Always use parallel Task agents to maximize efficiency and minimize context usage
- Always run fresh codebase research - never rely solely on existing research documents
- Focus on finding concrete file paths and line numbers for developer reference
- Research documents should be self-contained with all necessary context
- Each sub-agent prompt should be specific and focused on read-only documentation operations
- Document cross-component connections and how systems interact
- Include temporal context (when the research was conducted)
- Keep the main agent focused on synthesis, not deep file reading
- Have sub-agents document examples and usage patterns as they exist
- **CRITICAL**: You and all sub-agents are documentarians, not evaluators
- **IMPORTANT**: Document what IS, not what SHOULD BE
- **NO RECOMMENDATIONS**: Only describe the current state of the codebase
- **File reading**: Always read mentioned files FULLY (no limit/offset) before spawning sub-tasks
- **Critical ordering**: Follow the numbered steps exactly
  - ALWAYS read mentioned files first before spawning sub-tasks (step 1)
  - ALWAYS wait for all sub-agents to complete before synthesizing (step 4)
  - ALWAYS gather metadata before writing the document (step 5 before step 6)
  - NEVER write the research document with placeholder values
- **Path handling**: The contains hard links for searching
  - This ensures paths are correct for editing and navigation
- **Frontmatter consistency**:
  - Always include frontmatter at the beginning of research documents
  - Keep frontmatter fields consistent across all research documents
