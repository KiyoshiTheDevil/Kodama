# Kodama Agent Guide

These instructions apply to the whole repository. More specific `AGENTS.md`
files extend this guide for their directory trees:

- [`src/AGENTS.md`](src/AGENTS.md) — React frontend architecture and clean-code
  rules.
- [`python-backend/AGENTS.md`](python-backend/AGENTS.md) — Flask backend
  architecture and clean-code rules.

When instructions differ, follow the guide closest to the file being changed.
Do not bypass a scoped guide by placing code in a less appropriate directory.

## Project Boundaries

Kodama is a Tauri 2 desktop application with a React/JSX frontend and a Python
Flask backend.

| Location          | Responsibility                                      |
|-------------------|-----------------------------------------------------|
| `src/`            | Main React frontend.                                |
| `python-backend/` | Flask API, integrations, and backend domain logic.  |
| `src-tauri/`      | Tauri configuration and native Rust commands.       |
| `composer/`       | Standalone TypeScript/React lyrics composer.        |
| `e2e/`            | Browser and desktop end-to-end tests.               |

Keep these boundaries explicit. Frontend code talks to backend code through
the existing HTTP API and to native code through Tauri commands; it must not
reach into backend or Rust internals.

## Clean-Code Rules

- Put behavior in the narrowest domain that owns it. Prefer extending an
  existing feature or service over creating a generic dumping ground.
- Keep composition and entry-point files thin. They wire modules together;
  they do not own domain behavior.
- Give every module one clear responsibility. Split a module when independent
  reasons to change begin to accumulate, not merely because it is long.
- Prefer small, explicit interfaces and dependency flow over hidden globals,
  cross-domain imports, or duplicated state.
- Reuse existing helpers and conventions before introducing a new abstraction.
  Extract shared code only after it has a stable, genuinely shared purpose.
- Use descriptive domain names. Avoid vague additions such as `utils`,
  `helpers`, `common`, `manager`, or `misc` when a precise name is available.
- Keep functions focused, use guard clauses for invalid states, and avoid deep
  nesting. Comments should explain intent or constraints, not restate code.
- Do not mix refactors with unrelated behavior changes. Preserve public API,
  persisted-data, and IPC contracts unless the task explicitly changes them.
- Validate data at system boundaries and never log secrets, authentication
  headers, tokens, cookies, or private profile data.
- Add or update focused tests for changed behavior. Test public outcomes rather
  than implementation details.
- Leave generated output, caches, dependencies, and build artifacts untouched
  unless the task specifically concerns them.

## Working Method

1. Read the nearest `AGENTS.md` and inspect neighboring code before editing.
2. Identify the owning layer and keep dependencies pointing toward it.
3. Make the smallest coherent change that fully solves the task.
4. Run the most focused checks first, then the relevant project checks.
5. Report checks that could not run and the concrete reason.

## Repository Verification

For frontend or cross-cutting JavaScript changes, run from the repository root:

```sh
npm run lint
npm run build
```

Use `npm run e2e:browser` only when the change affects a covered user flow and
ports 1421 and 9847 are available. Follow the backend guide for Python checks.

