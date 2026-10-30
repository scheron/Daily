# Demo build and screenshots

Daily Demo is a separate build for exploring the app and capturing product screenshots. Its projects, tasks, notes, tags, subtasks, and comments are fictional and written in English.

## Build and open

Use the same macOS on Apple Silicon, Node, and pnpm requirements as the desktop app.

```bash
pnpm install
pnpm demo:build
pnpm demo:open
```

The standalone app is written to `apps/desktop/dist-demo/mac-arm64/Daily Demo.app`. It can run alongside the installed Daily app. Demo output is local and ignored by Git; the screenshots live in `media/screenshots/` as regular repository assets.

For development with hot reload:

```bash
pnpm demo
```

## Data and isolation

The demo has its own bundle identifier and stores its data under `~/Library/Application Support/Daily-Demo`. It seeds only an empty demo profile and retains changes between launches. It does not copy data or settings from Daily or Daily-dev.

Sync starts off. Quick task hotkeys, automatic update checks, and background model-catalog refresh are disabled in the demo. No provider credentials or downloaded AI models are included, and no assistant conversation is staged.

Dates are relative to the first launch, so the calendar opens on a populated day. To regenerate the dataset, quit Daily Demo and run:

```bash
pnpm demo:reset
pnpm demo:open
```

Reset removes only the dedicated demo profile, including changes made there.

## Capture set

The README uses PNG screenshots exported from the running demo without replacing UI content. Choose **Daily Demo → Save Screenshot…** (**Command–Shift–S**) to capture the focused app window before the save dialog opens. The export excludes the pointer and macOS screen-sharing overlays. This menu exists only in the demo build.

Use a consistent window size, move the pointer away from content, and dismiss tooltips before each capture. The overview uses Compact interface size in Settings → General; the task-detail captures use a wider task panel.

| File in `media/screenshots/` | View                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `01-board.png`               | Orbit project, today's board, light appearance, Normal board mode                                                             |
| `02-task-details.png`        | Open “Refine the onboarding experience”; widen the task panel for the brief                                                   |
| `03-calendar.png`            | Open the calendar with Command–E; show the populated current month                                                            |
| `04-milestones.png`          | Switch the calendar dock to Milestones; show target dates and progress                                                        |
| `05-agents.png`              | Choose Agents board mode and Compact interface size; collapse Backlog and Cancelled to keep the five execution stages visible |
| `06-search.png`              | Open Search with Command–F and search for `keyboard`                                                                          |
| `07-dark.png`                | Choose dark appearance in Settings → General and open the task brief                                                          |
| `08-agent-comments.png`      | Open “Review agent implementation” and scroll to the Codex and Claude Code demo review notes                                  |
| `09-agent-integrations.png`  | Open Settings → Sync on the local demo server and choose Agent                                                                |
| `10-agent-approval.png`      | Capture the matching-code approval for Daily Demo Client before approving                                                     |
| `11-live-mcp-comment.png`    | Open “Review agent implementation” after the real MCP client posts its review comment                                         |

Keep screenshot content synthetic and in English. Capture new features from the real UI before describing them in the gallery.

## Recreate the MCP integration captures

The Codex and Claude Code notes in the seed are explicitly labeled demo examples. The connection and approval screens were captured against a real, separate localhost server. The Daily Demo Client comment was sent through actual OAuth PKCE and MCP calls; no external account or model API key was used.

Start the server in a separate terminal:

```bash
pnpm demo:server
```

This builds the server and runs it with the workspace's Electron Node runtime to match the SQLite native module. It listens only on `127.0.0.1:18787`, names itself **Orbit Demo Server**, and keeps its data in `/tmp/daily-demo-server-state`. Its console prints the claim code on first run.

1. In **Daily Demo**, open **Settings → Sync → Connect** and enter `http://127.0.0.1:18787`.
2. Use the fictional device name **Studio Mac**, enter the console's claim code, and switch to the demo server. Only the demo workspace is sent to it.
3. Choose **Agent** to open the connection instructions. Capture the Claude Code or Codex instructions.
4. In another terminal, run `pnpm demo:mcp`. Compare its printed code with Daily's approval dialog; capture the dialog and approve **Daily Demo Client**.
5. The helper lists the real MCP tools, reads `task:demo-agent-review` in Orbit, and adds one fictional Markdown review note with TypeScript code. Capture it in the task's activity. The helper keeps OAuth credentials in memory and exits after the write.
6. In Settings → Sync, revoke **Daily Demo Client**, disconnect the demo server, and stop the server with **Control–C**. The local tasks and review note remain in Daily Demo.

The HTTP notice in the connection screenshots reflects the loopback-only demo setup. Follow the server's own deployment guide for a hosted server.

The app profile and server state form a pair after claim. Resetting only the app loses that demo Parent credential. For a fresh integration run, quit the app and stop the server first, then reset the app profile and remove only the dedicated `/tmp/daily-demo-server-state` directory before starting again.
