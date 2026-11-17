# Demo build and screenshots

Daily Demo is a separate build for trying the app and taking product screenshots. Its projects, tasks, notes, tags, subtasks, and comments use made-up data in English.

## Build and open

Use the desktop app's requirements for macOS on Apple Silicon, Node, and pnpm.

```bash
pnpm install
pnpm demo:build
pnpm demo:open
```

The build writes the app to `apps/desktop/dist-demo/mac-arm64/Daily Demo.app`. It can run alongside the installed Daily app. Build output stays local, and Git ignores it. Screenshots are regular repository files in `media/screenshots/`.

For development with hot reload:

```bash
pnpm demo
```

## Data and isolation

The demo has its own app identifier and stores data under `~/Library/Application Support/Daily-Demo`. It adds sample data only when the demo profile is empty. It keeps changes between launches. It does not copy data or settings from Daily or Daily-dev.

Sync is off at first. Automatic update checks and background refresh of the model catalog are disabled. The demo includes no provider credentials or downloaded AI models. It has no prepared Assistant conversation.

Dates use the first launch as their starting point, so the calendar opens on a day with tasks. To create the sample data again, quit Daily Demo and run:

```bash
pnpm demo:reset
pnpm demo:open
```

Reset removes only the demo profile, including changes made there.

## Capture set

The README uses PNG screenshots from the running demo. Keep the app's real UI content in each screenshot. Choose **Daily Demo → Save Screenshot…** (**Command–Shift–S**) to capture the focused window before the save dialog opens. The image excludes the pointer and macOS screen-sharing overlays. This menu exists only in the demo build.

Use the same window size for each capture. Move the pointer away from content and close tooltips before taking a screenshot. The overview uses Compact interface size in Settings → General. Task-detail screenshots use a wider task panel.

| File in `media/screenshots/` | View                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `01-board.png`               | Orbit project, today's board, light appearance, Normal board mode                                                             |
| `02-task-details.png`        | Open “Refine the onboarding experience”; widen the task panel for the brief                                                   |
| `03-calendar.png`            | Open the calendar with Command–E; show the current month with tasks                                                           |
| `04-milestones.png`          | Switch the calendar dock to Milestones; show target dates and progress                                                        |
| `05-agents.png`              | Choose Agents board mode and Compact interface size; collapse Backlog and Cancelled to keep the five execution stages visible |
| `06-search.png`              | Open Search with Command–F and search for `keyboard`                                                                          |
| `07-dark.png`                | Choose dark appearance in Settings → General and open the task brief                                                          |
| `08-agent-comments.png`      | Open “Review agent implementation” and scroll to the Codex and Claude Code demo review notes                                  |
| `09-agent-integrations.png`  | Open Settings → Sync on the local demo server and choose Agent                                                                |
| `10-agent-approval.png`      | Capture the approval dialog with matching codes for Daily Demo Client before approving                                        |
| `11-live-mcp-comment.png`    | Open “Review agent implementation” after the real MCP client posts its review comment                                         |

Use made-up content in English for screenshots. Capture new features from the real UI before describing them in the gallery.

## Recreate the MCP integration captures

The sample Codex and Claude Code notes are labeled as demo examples. The connection and approval screenshots used a real, separate server on localhost. The Daily Demo Client comment used real OAuth PKCE and MCP calls. It required no external account or model API key.

Start the server in a separate terminal:

```bash
pnpm demo:server
```

This builds the server and runs it with the workspace's Electron Node runtime. That runtime matches the SQLite native module. The server listens only on `127.0.0.1:18787` and uses the name **Orbit Demo Server**. It stores data in `/tmp/daily-demo-server-state`. Its console prints the claim code on first run.

1. In **Daily Demo**, open **Settings → Sync → Connect** and enter `http://127.0.0.1:18787`.
2. Use the made-up device name **Studio Mac**. Enter the console's claim code and switch to the demo server. Only the demo workspace is sent to it.
3. Choose **Agent** to open the connection instructions. Capture the Claude Code or Codex instructions.
4. In another terminal, run `pnpm demo:mcp`. Compare its printed code with Daily's approval dialog. Capture the dialog and approve **Daily Demo Client**.
5. The helper lists the real MCP tools and reads `task:demo-agent-review` in Orbit. It adds one made-up Markdown review note with TypeScript code. Capture the note in the task's activity. The helper keeps OAuth credentials in memory and exits after the write.
6. In Settings → Sync, revoke **Daily Demo Client** and disconnect the demo server. Stop the server with **Control–C**. The local tasks and review note remain in Daily Demo.

The connection screenshots show an HTTP notice because the demo server accepts only local connections. Follow the server's deployment guide for a hosted server.

After claim, the app profile and server state form a pair. Resetting only the app loses the demo Parent credential. To run the integration again from scratch:

1. Quit the app and stop the server.
2. Reset the app profile.
3. Remove only the demo server's `/tmp/daily-demo-server-state` directory.
4. Start again.
