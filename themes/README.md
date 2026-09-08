# Published themes

One file per theme. These are **not** built into Kodama: they are published in the catalogue and
downloaded by the app, so adding one is a file and a commit. No build, no tag, no release.

The app reads `updates/themes.json` from `master`, the same way it reads `news.json`, so a theme
is live for every installed copy the next time it looks.

## Adding one

1. Write `themes/<id>.json` (see `nord.json`).
2. `npm run themes:catalogue`
3. Commit both your file and the regenerated `updates/themes.json`.

## Fields

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Lowercase, letters, digits, hyphens. Also the filename. |
| `title` | yes | Shown in the picker and the store. |
| `tokens` | yes | The theme itself, see below. |
| `mode` | yes | `dark` or `light`. **Declared, never guessed** — it decides which set of HeroUI's own tokens applies, and getting it wrong gives white text on a white card. |
| `description` | no | One line of catalogue copy. |
| `creators` | no | GitHub usernames. Defaults to the repo owner. |
| `version` | no | Raise it when you change the theme; the app offers an update to anyone who installed the older one. Defaults to `1.0.0`. |
| `minVersion` | no | The oldest Kodama that can render it. Defaults to the release that introduced installable themes. Raise it only if you use a token that did not exist before. |
| `tags` | no | For browsing. |
| `preview` | no | The four swatches on the store card. Derived from the tokens when absent. |

An `id` that matches a built-in theme **replaces** its catalogue entry, which is how a shipped
theme gets corrected without a release.

## Writing the tokens

A theme lists only what it **changes**. `:root` in `src/index.css` is the ground everything stands
on: the strokes, the fill states and the text ladder are white at fixed opacities and sit
correctly on any ground of roughly the same darkness. Grove is thirteen values for that reason.

Two things are worth setting even when they look fine inherited, because they were chosen against
the default grey and read as foreign objects on anything else:

- `--slider-track`
- `--scroll-thumb`, `--scroll-thumb-dim`, `--scroll-thumb-hover`

`--accent` is a **proposal**, not a setting. It applies only while the listener has not picked an
accent of their own; theirs always wins, and "Use the theme's colour" hands it back.

## What a theme may contain

Values are checked before anything is applied. A value is dropped if it contains `{`, `}`, `;`,
`@`, `url(` or `expression(`, or if it is longer than 200 characters. A name that is not
`--something` is dropped too.

This is a security boundary, not a taste one: it stops a theme from ending the CSS rule and
writing selectors of its own, from fetching over the network, and from pulling in a stylesheet.
It does **not** stop a theme from being unreadable — `--bg-base` and `--t1` both white passes
every check. Look at a theme before publishing it.
