# LumenAI Coding Agent — Phase 1

This phase adds the foundation for long-running project work without changing the existing chat/provider architecture.

## Added
- Persistent `projects` and `project_files` tables (SQLite/PostgreSQL through the existing DB adapter).
- Authenticated project CRUD/read APIs.
- Per-project file editor storage with path traversal protection and file-size limits.
- Persistent `agent_tasks` and `agent_events` tables.
- A first agent worker that reads project context, asks the selected provider for a JSON file-change plan, validates paths, applies file changes, and records progress.
- `/projects` web workspace with project list, file editor, and AI Agent task box.
- Existing Gemini shared-key resolution now also works for normal chat when `ALLOW_SHARED_KEYS=true`.

## Important
This is the first agent foundation, not the final autonomous build system. The next phase should move execution into a durable worker/queue, add explicit tools for build/test/preview, and add resumable multi-step loops. Do not treat arbitrary AI-generated shell commands as trusted; future command execution must remain allowlisted/sandboxed.
