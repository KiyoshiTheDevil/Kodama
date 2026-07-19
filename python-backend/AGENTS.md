# Kodama Backend Guide

This guide extends [`../AGENTS.md`](../AGENTS.md) and applies to every file
under `python-backend/`. The root guide remains mandatory.

Treat the modular application under `src/` as the source of truth. Do not add
route handlers, domain behavior, or application state to `server.py`.

## Entry Points and Composition

- `server.py` is the executable entry point. It creates the Flask application
  and passes it to `run_server()`.
- `src/__init__.py:create_app()` is the composition root. It creates shared
  services, restores a saved profile, registers blueprints, and configures
  runtime helpers.
- `src/routes/__init__.py` owns the blueprint registry. Add a new blueprint
  there only after its route package is ready.
- PyInstaller specs and `build_server.bat` build `server.py`; keep them aligned
  if the entry point ever changes.

## Project Layout

| Location               | Responsibility                                            |
|------------------------|-----------------------------------------------------------|
| `src/routes/<domain>/` | Flask blueprints, request validation, and HTTP responses. |
| `src/lib/<domain>/`    | Reusable domain logic and stateful services.              |
| `src/config.py`        | Application configuration and filesystem locations.       |
| `tests/`               | Route and runtime tests using isolated fakes.             |

Route families are organized by domain: `auth`, `profiles`, `library`,
`streaming`, `discovery`, `downloads`, `lyrics`, `composer`, `cache`, `lastFm`,
`operations`, and `root`.

Dependency direction is `server.py -> create_app() -> routes -> lib`. Library
modules must not import route modules, and one route domain must not reach into
another route domain's private helpers. Cross-domain behavior belongs in a
precisely named service under `src/lib/` and is injected during composition.

## Clean-Code Rules

- Route modules are HTTP adapters only: parse and validate request data, obtain
  a service, call it, and translate the result into a response.
- Domain rules, integrations, caching, and state transitions belong in a
  focused service under `src/lib/<domain>/`, not in blueprints or entry points.
- Application-scoped mutable state must be owned by a service registered in
  `app.extensions`. Do not introduce module-level mutable globals or duplicate
  service instances per request.
- Keep third-party APIs, filesystem access, subprocesses, and network calls at
  explicit boundaries. Domain code should depend on narrow wrappers that tests
  can replace with fakes.
- Validate untrusted input at the route boundary. Return consistent, useful
  errors without exposing internal exceptions, paths, credentials, or profile
  data.
- Use explicit domain types and names. Avoid unstructured dictionaries crossing
  several layers when a dataclass or other stable model would make the contract
  clear.
- Keep functions focused and favor guard clauses over nested conditionals.
  Catch only exceptions that can be handled meaningfully; never use a silent
  blanket `except`.
- Keep I/O out of constructors when possible. Lifecycle and startup work is
  coordinated by `create_app()` or an explicit service method.
- Preserve API response shapes and persisted profile/cache formats unless a
  coordinated migration is part of the task.
- Tests must not use live accounts, the real network, or user profile data.

## Adding or Changing Backend Features

1. Place an endpoint in the closest existing `src/routes/<domain>/` package.
   Create a new package and blueprint only when the feature is a distinct
   domain.
2. Keep routes thin: validate input, call a service, and format the response.
3. Put shared logic, caches, and mutable state in `src/lib/`. Register shared
   instances in `create_app()` and retrieve them from `app.extensions` through
   the domain's `_services.py` helpers.
4. Use the active client through `YoutubeMusicSession.get_active_client()` and
   profile state through `session.state`; do not create ad-hoc `YTMusic`
   clients inside routes.
5. Add or update focused tests under `tests/`. Route tests should use
   `RouteTestCase` and its fakes instead of real network or profile data.
6. If a new domain is truly necessary, give it matching, cohesive route and
   library packages rather than scattering related files across existing
   domains.

## Profiles and Startup

- `YoutubeMusicSession.autoload_first_profile()` restores an available saved
  account during application creation. Do not move this work into a request
  handler.
- Local profiles are supported alongside Google-authenticated profiles. Check
  `Profile.is_local(name)` before accessing remote YouTube Music data.
- Authentication headers and user profile data are sensitive. Do not log,
  commit, or expose their contents in API errors.

## Verification

From `python-backend/`, use the project virtual environment when available:

```sh
python -m unittest discover -s tests -p 'test_*.py'
git diff --check
```

For a lightweight syntax check that does not import optional dependencies:

```sh
python3 -c "import ast, pathlib; [ast.parse(p.read_text(encoding='utf-8'), filename=str(p)) for p in pathlib.Path('src').rglob('*.py')]; print('AST OK')"
```

If the system Python lacks Flask or other backend dependencies, use the project
virtual environment rather than installing packages globally.
