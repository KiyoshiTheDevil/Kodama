# Kodama Frontend Guide

This guide extends [`../AGENTS.md`](../AGENTS.md) and applies to every file
under `src/`. The root guide remains mandatory.

## Required Architecture

Keep frontend code arranged by ownership:

| Location                  | Responsibility                                      |
|---------------------------|-----------------------------------------------------|
| `app/`                    | Application composition, shell, startup, overlays.  |
| `app/hooks/`              | Hooks that coordinate application-wide behavior.   |
| `features/<domain>/`      | UI and logic owned by one product domain.           |
| `features/<domain>/hooks/`| Hooks private to that feature.                      |
| `shared/api/`             | Reusable HTTP transport and API boundary helpers.   |
| `shared/hooks/`           | Truly cross-feature React hooks.                    |
| `shared/ui/`              | Domain-neutral, reusable presentation components.  |
| `shared/lib/`             | Domain-neutral, framework-light utilities.          |
| `shared/i18n/`            | Translation infrastructure.                        |

Dependency direction is `app -> features -> shared`. A feature may use shared
code but must not import from `app`. Features must not reach into another
feature's private files. When domains need to collaborate, expose a small
public boundary or coordinate them in `app/`.

Do not create new top-level source folders without updating this guide and
explaining the new architectural boundary.

## Component and Module Rules

- Keep route/screen composition separate from reusable presentation. Large
  components should delegate coherent sections, stateful behavior, or effects
  to focused components and hooks in the same feature.
- Components render UI and handle local interaction. Move API orchestration,
  subscriptions, timers, and multi-step state transitions into named hooks or
  services when they obscure the render path.
- Keep state as local as possible. Use feature context for state shared within
  one domain and application context only for genuinely application-wide state.
- Separate state and actions in contexts when doing so limits unnecessary
  rerenders. Memoize provider values that contain objects or functions.
- Prefer derived values over synchronized duplicate state. Effects must have a
  single purpose, complete dependency lists, and cleanup for listeners, timers,
  subscriptions, and abortable requests.
- Do not call `fetch` ad hoc when an existing API boundary owns the operation.
  Add domain-specific request functions near the feature or to `shared/api/`
  only when they are reused across domains. Check response status and model
  loading, empty, and error states deliberately.
- Isolate Tauri `invoke` and plugin calls behind a feature service or hook when
  they are reused or stateful. Browser-safe fallbacks must remain explicit for
  code exercised by browser E2E tests.
- Keep domain calculations in plain JavaScript modules so they can be tested
  without rendering React. Do not hide domain logic inside JSX callbacks.
- Use existing UI primitives, icons, design tokens, and i18n patterns. Do not
  duplicate reusable controls or hard-code user-visible strings when a
  translation path exists.
- Prefer precise filenames that match their primary export or responsibility.
  Avoid catch-all files and unrelated groups of exports.

## Feature Changes

For a new frontend capability:

1. Choose the owning `features/<domain>/` directory; create a domain only when
   none of the existing domains owns the behavior.
2. Put pure data transformation and API boundary code outside components.
3. Keep reusable UI local until at least two domains genuinely require it;
   only then move the stable abstraction to `shared/`.
4. Compose the feature into `app/` through a narrow props, hook, or context
   interface.
5. Cover pure logic with focused tests and update E2E coverage for important
   user-visible flows when appropriate.

## Verification

Run from the repository root:

```sh
npm run lint
npm run build
```

For user-flow changes, also consider:

```sh
npm run e2e:browser
```

Do not rely on a generic browser preview for Tauri-only behavior; verify the
native path with the Tauri application or an appropriate desktop E2E test.

