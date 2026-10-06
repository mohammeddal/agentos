# Cleanup record — 2026-09-27

Branch: `codex/agentos-ux-cleanup`. Recovery baseline: initial commit `a652777`.

## Removed after reference checks

| Removed source                                                        | Evidence                                                                                                             |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/src/App.tsx`                                            | No imports and not selected by `main.tsx`; superseded mock prototype                                                 |
| `apps/desktop/src/styles.css`                                         | No stylesheet imports; belonged to the removed prototype                                                             |
| `packages/ui/{package.json,tsconfig.json,src/index.tsx}`              | Only consumer was the unreachable `App.tsx`                                                                          |
| Desktop dependencies on core/runtime/schemas/ui                       | Only desktop consumer was that same unreachable prototype; core/runtime/schemas remain used by the CLI/core packages |
| Desktop TypeScript references to those packages; root reference to UI | Removed to match the actual dependency graph                                                                         |

Tracked removals can be recovered from `a652777` using Git. Nothing in local company storage, `.agentos/`, `.staffforge/`, native application support, or user project directories was removed. Dependencies, current installers, build caches, and QA artifacts are ignored rather than treated as application source.

## Reorganized, not deleted

Sixty obsolete CSS rules/selectors for the retired company organization chart and old sidebar were removed or narrowed after confirming their class names had no remaining JSX consumers. The removed UI package's generated leftovers were moved to `/private/tmp/agentos-unused-ui.cOzDQZ/ui` rather than erased; that temporary backup may be cleared by macOS. Tracked source remains recoverable from Git independently.

The original flat desktop source directory was separated into `app`, feature-owned directories, `shared`, and `legacy`. Components, models, CSS, and tests move together. Browser and server imports were updated. Company forms, directory cards, navigation, search, and the dialog were extracted from the large shell.

The Studio, DataGuild, and Workbench entry points remain reachable through their existing query parameters. `OperationsWorld`, DataGuild catalog/example data, and shared Studio types remain imported, so they were retained. Internal runtime package names remain unchanged.

README now describes the actual default AgentOS surface. Detailed usage and alternate-experience instructions have dedicated guides. Earlier architecture/product plans remain labeled references; their planned capabilities must not be mistaken for completed company-runtime integration.

## Ongoing safeguards

Run `pnpm audit:source` to identify broken relative imports and unreachable source candidates. The command does not delete anything and is not a whole-program dead-code proof. Public package exports and tests are intentional roots. Run type checking, tests, builds, and browser smoke checks before removing a flagged candidate.

Formatting is pinned and scoped to the maintained company UI, shared files, scripts, and documentation. Legacy UI formatting is not part of the default formatting command, to keep future changes focused.

## Public source preparation — 2026-10-05

Removed the unreferenced `src/features/tasks/CompanyTasks.tsx` (old `TaskForm`) and its exclusive `company-tasks.css`. The source audit identified exactly these two unreachable files, and a repository-wide reference search found no consumers of the module or its export. The active editor is `src/features/studio/WorkflowStudio.tsx`. The old files remain recoverable from commit `dea8856`. No runtime stores or retained alternate experiences were removed.
