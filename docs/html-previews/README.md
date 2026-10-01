# HTML Renderer review captures

These four representative browser images document Phase 8 visual inspection. They are **not** an exhaustive screenshot matrix or an automated CI gate. The semantic source is always [the shared Catalog scenario registry](../../scripts/catalog/scenarios.ts); width, theme, motion, and mode are renderer review conditions. Captures came from Google Chrome 154.0.8037.59 on macOS / Apple Silicon through the local Catalog `/html` route. The [Phase 8 record](../rearchitecture/phase-8-html.md) states what was verified and what remains unverified.

| Image                                  | Scenario                     | Review condition          | What to inspect                                                                     |
| -------------------------------------- | ---------------------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| [running-light.png](running-light.png) | `task-running-indeterminate` | 640 CSS px, Light, Live   | One ongoing Run cue, persistent `running` and total-unknown text.                   |
| [group-dark.png](group-dark.png)       | `run-group-mixed`            | 1200 CSS px, Dark, Report | Dense TaskGroup, independent failed Task and succeeded Run, final Result.           |
| [table-narrow.png](table-narrow.png)   | `table-narrow-long-redacted` | 360 CSS px, Light, Report | Native Table with visible horizontal-inspection cue; no column is silently removed. |
| [results-print.png](results-print.png) | `results-all-states`         | 640 CSS px, print media   | Light print view, Result variants, visible Failure code/message/details.            |

To review current source, run `./scripts/dev.sh bun run catalog` and use the Catalog controls. Regenerate a capture only after opening the corresponding `/html` view in a real browser and confirming the rendered content. A screenshot from another browser or OS must be labelled with that environment; replacing these files alone is not proof of a cross-browser result.
