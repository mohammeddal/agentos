# UX cleanup verification — 2026-09-27

Branch: `codex/agentos-ux-cleanup`.

This records the earlier UX-only change. For the subsequent native runtime integration, see [Live execution](LIVE-EXECUTION.md). The Codex transport passed actual reply and conversation-resume tests; Claude returned a revoked-token 401 and requires reauthentication before successful generation can be verified.

## Activity progressive-disclosure follow-up

- Replaced the oversized Activity view selector with compact **Runs / Rehearsals** controls and converted live history into a scannable status inbox.
- Completed runs now default to collapsed rows containing title, engine, timestamp, step count, status, and a sanitized one-line output summary. Selecting the header or summary reveals the full response; technical steps, workspace, and event logs remain under a separate disclosure. Approval and failure filters remain unchanged.
- Native WebKit verification used the three existing saved Codex runs: all rendered as compact summaries, the first expanded on click, and its eight-event technical disclosure remained collapsed. No provider request or saved activity was changed during inspection.
- All 190 Vitest tests passed together with TypeScript, formatting, production build, whitespace, and source reachability checks. The final macOS app bundle was installed and reopened for the native inspection.

## Workflow-only task editor follow-up

- Removed the duplicated **Task & team** editor. New and ordinary existing tasks open directly in the expanded **Workflow map**, with **Schedule** as the only secondary tab.
- The root Task block now owns task name, outcome, project, attachments, and the start approval. Office, Domain, and Agent blocks derive the persisted task team, while each work block retains its own model/effort and scoped resources.
- Older assignment-only tasks are represented as connected visual blocks without changing saved data until **Save task**. Older conditional handoff tasks retain an explicit migration boundary so routes are never discarded silently.
- Chromium QA created a task entirely through the map, configured and connected a real agent, switched through Schedule, saved, reopened Edit, and confirmed it returned directly to the two-block map. Desktop and 390 × 844 layouts were visually inspected; console errors were zero. This browser-only record is isolated from native company data and no provider run was started.
- All 189 Vitest tests and 16 offline native tests passed (four account-backed tests remain ignored by default), together with TypeScript, formatting, production build, whitespace, and source reachability checks.
- The macOS `.app` bundle built, replaced `/Applications/AgentOS.app`, and reopened with saved chats intact. Its executable hash matches the packaged bundle, and it is the only AgentOS installation found in the checked system and user Applications folders. The optional DMG presentation-image helper failed, so this pass produced the installed `.app` but not a new `.dmg`.

## Native execution follow-up

### Professional terminal follow-up

- Rebuilt the terminal as a compact developer console instead of a large form. Commands now live at an inline prompt directly below the transcript; the separate bottom command bar and Run button were removed. Enter runs, Shift+Enter creates a multiline command, and Up/Down still navigates history.
- Added pointer and keyboard resizing with bounded height, quieter session tabs, concise shell status, a focused working-directory row, a compact footer, growing multiline input, and click-to-focus behavior in empty console space. Transcript polling now scrolls only when the session or latest entry changes, so reading older output is not interrupted every 300 ms.
- Isolated visual checks covered light/dark desktop and 390 × 844 dark layouts. The user’s open native agent editor contained unsaved text, so it was deliberately left untouched; native behavior was verified through the real runtime tests rather than by closing that form for a screenshot.
- All 188 Vitest tests across 29 files passed, including terminal resize bounds. All 16 offline native tests passed, including a real temporary shell command and working-directory validation; four account-backed tests remained intentionally ignored. Typecheck, formatting, whitespace checks, the 131-file source audit, production build, and headless `.app`/`.dmg` packaging passed. The signed build replaced `/Applications/AgentOS.app` without replacing saved application data.

### Start composer surface follow-up

- Reworked the Start composer as one quiet input surface: narrower proportions, a flatter background, a restrained edge and focus treatment, tighter utility controls, and no elevated card shadow.
- Removed the textarea-level focus outline that drew a second rectangle inside the composer. Keyboard focus remains visible on the outer composer through `:focus-within`, preserving one clear focus state instead of a box inside a box.
- Isolated Chromium checks covered desktop light/dark and 390 × 844 dark layouts. The composer remained a single surface at rest and while focused, and the final session reported zero console warnings or errors.
- All 187 Vitest tests across 29 files passed, along with typecheck, formatting, whitespace checks, the 131-file source audit, production build, and headless `.app`/`.dmg` packaging. The signed build replaced `/Applications/AgentOS.app`, reopened successfully, and retained the native Start controls and saved sidebar data.

### Persistent project directory follow-up

- Reduced the primary navigation to five destinations by removing the duplicate Projects button. The desktop sidebar and compact Workspace drawer now keep Projects, project-scoped chats/tasks, unassigned chats/tasks, and Archived available on every page, including Start.
- Added a direct Projects **+**, retained creation and lifecycle actions under **…**, and exposed **+ Chat** / **+ Task** inside empty project branches. Creating work from a project preselects that project and the saved item appears inside the same expanded branch.
- Removed the second all-project explorer from project detail. Selecting a project now opens only its own Shared, domain, and agent workspace tree plus its project details.
- Isolated Chromium checks created a temporary project and project-scoped task, verified automatic project selection and nesting, and checked the persistent hierarchy at 1200 × 800 and in the 390 × 844 mobile drawer. The records existed only in the isolated browser session; no native company records or provider runs were changed.
- A fresh final Chromium session reported zero console warnings or errors. All 187 Vitest tests across 29 files passed, along with typecheck, formatting, whitespace checks, the 131-file source audit, and the production web build.
- Final `.app` and `.dmg` packaging passed. The previous `/Applications/AgentOS.app` bundle was removed, the locally signed final package was installed, its executable matched the signed package byte-for-byte, and the reopened native accessibility tree confirmed the five destinations plus the persistent Projects/chat/task directory on Start. Saved application data remained outside the replaced bundle.

### Library hierarchy follow-up

- Reframed Library → Engine capabilities as the shorter **Capabilities** surface. The inventory, engine switcher, search, type filters, scope filter, and record inspection remain primary; connection checks, optional workspace scanning, notifications, privacy notes, limitations, and raw source paths now live in one explicit **Settings** panel.
- Disabled the unfinished Gemini selector instead of presenting a non-working inventory choice. Codex and Claude Code still refresh independently, and the compact status line distinguishes browser preview from locally ready execution engines.
- Isolated Chromium checks covered the collapsed inventory and expanded Settings panel at 1200 × 800 and 390 × 844 in light and dark appearances. The settings toggle, Codex/Claude switch, responsive stacking, category navigation, and zero-warning console state were verified.
- Visual artifacts: `library-capabilities-clean.png`, `library-capabilities-mobile.png`, `library-engine-settings-mobile.png`, `library-engine-settings-desktop.png`, and `library-engine-settings-dark.png` under ignored `output/playwright/`.
- All 187 Vitest tests across 29 files passed. Typecheck, formatting, whitespace checks, the 131-file source audit, production build, and final `.app`/`.dmg` packaging passed.

### Local terminal follow-up

- Added a global bottom terminal dock, toggled from the top toolbar or Cmd/Ctrl+J, without adding another primary navigation destination. It supports multiple sessions, explicit working directories, command history, stdout/stderr, exit status, Clear, Stop, and session removal.
- The native runtime launches only commands explicitly submitted in the terminal, closes stdin, canonicalizes working directories, limits command/output size and concurrency, and terminates the process group on Stop or app exit. Transcripts are memory-only. This manual terminal is separate from provider tool approvals.
- Browser preview truthfully disables command execution. Isolated Chromium checks covered the Start layout with the terminal open at desktop and 390 × 844, verified no document overflow, and found zero console errors. No command was executed by browser QA.
- Native unit coverage executed a real temporary `printf` command, captured its output and zero exit code, and verified directory validation. The current limitation is explicit: interactive prompts and full-screen terminal programs are not supported.
- All 182 Vitest tests across 29 files and 16 offline native tests passed; four live native tests remain opt-in. Typecheck, formatting, whitespace checks, the 131-file source audit, and final `.app`/`.dmg` packaging passed.

### Codex-inspired shell follow-up

- Reworked the shared light and dark palettes around neutral graphite system colors, reduced sidebar and toolbar density, tightened page hierarchy, card radii, dialogs, and directory rows, and corrected short pages so they consistently begin below the toolbar instead of vertically centering.
- Preserved office hues, agent state, approval/warning colors, and the floor-plan palette as semantic AgentOS signals. The company map remains the distinctive visual surface inside the quieter shared shell.
- Isolated Chromium checks covered the clean Start surface, Company map, and Activity in desktop light/dark appearances plus Start at 390 × 844. The project/task directory remains absent from Start and present on operational pages; no saved work or provider run was created.
- Visual artifacts: `codex-shell-start-light.png`, `codex-shell-map-light.png`, `codex-shell-activity-dark.png`, and `codex-shell-mobile.png` under ignored `output/playwright/`.
- Browser console errors were zero. All 180 Vitest tests across 28 files, typecheck, formatting, whitespace checks, the 127-file source audit, and final `.app`/`.dmg` packaging passed.

### Clean Start composer follow-up

- Rebuilt Start as a chat-first surface: a quiet centered invitation, an auto-growing composer anchored to the bottom, an attachment control, compact engine/settings disclosure, and one send arrow. Enter sends; Shift+Enter inserts a newline.
- Removed the projects/chats/tasks directory from Start in both the desktop sidebar and compact navigation drawer. Tasks and Projects retain the directory where it is useful. Model, effort, engine, project association, task conversion, assignee choice, provider setup, and privacy details remain available inside the upward-opening settings panel.
- Isolated Chromium checks covered desktop and 390 × 844 layouts, closed/open settings states, Escape dismissal, Shift+Enter multiline input, mobile navigation without recents, and zero console errors. No native provider request or saved native record was changed.
- 180 Vitest tests across 28 files passed. Typecheck, formatting, whitespace checks, the 127-file source audit, and final `.app`/`.dmg` packaging passed.

### Interface restraint follow-up

- Consolidated creation so Tasks, Projects, Offices, Agents, and Domains each have one visible page-level action. The Company map has one **Create…** menu; the duplicate expansion-room action, empty-state CTAs, add cards, office-open footer buttons, and sidebar project-plus button were removed. The sidebar’s three-dot menu remains its single global creation path.
- Replaced repeated page descriptions, local-storage/privacy copy, agent instruction/skill explanations, and project-folder guidance with one reusable `?` help control. It exposes the same content on hover, keyboard focus, and tap with a tooltip role. Decision-critical warnings, validation, approvals, connection state, and destructive consequences remain inline.
- Isolated Chromium checks covered Start, the directory menu, Tasks, Projects, the Company map, Offices, Agents, and Domains. Desktop and 390 × 844 map layouts were visually inspected; the help tooltip was confirmed in the accessibility tree on mobile; browser console errors were zero. No native records or provider runs were changed.
- 180 Vitest tests across 28 files passed. Typecheck, formatting, whitespace checks, the 127-file source audit, and final `.app`/`.dmg` packaging passed.

### Task workflow map follow-up

- Saved tasks now open with a persistent **Overview / Workflow map** switch. Overview preserves the existing execution and activity interface; Workflow map opens the expanded spatial builder and shows its saved block count when returning to Overview.
- Added an executable Office block alongside Domain and Agent. The picker groups real offices by domain, displays team size, rejects unavailable or empty offices, supports per-block prompts and model overrides, and compiles the selected office into its current agents in sequence.
- Isolated Chromium verification created a task, opened the map from its Overview, added the real Engineering office, added a custom prompt, connected Task → Office, returned to Overview, reloaded, and confirmed the two-block map and connection persisted. The map was visually inspected at 390 × 844 and browser console errors were zero. No native company records or provider runs were changed by this browser-only QA.
- 180 Vitest tests across 28 files passed, including Office validation and Office-to-agent runtime compilation. Typecheck, formatting, whitespace checks, source audit (126 reachable files, no broken imports), and final app/DMG packaging passed.

### First-class task workflow follow-up

- This entry documents the earlier intermediate design where **Workflow map** was a peer of **Task & team** and **Schedule**. The newer workflow-only follow-up above supersedes that editor layout. The expanded canvas still supports building before save, while older handoff tasks retain an explicit migration choice.
- Selecting a task/office/domain/agent/prompt block exposes compact **Inputs & capabilities** actions. Context, MCP, skill, and connector blocks are created already connected to that exact step; **Approval next** adds the following checkpoint. The embedded editor removes the duplicate Overview/Workflow switch.
- Context blocks accept notes, a source label/path, and selected task files. Tests verify that a file attached to one visual step is absent from the next step. Discovered non-disabled capabilities compile only on a matching provider and produce an exact required-capability instruction; manual/unverified, disabled, provider-mismatched, and unenforceable restriction configurations fail closed.
- Chromium QA created a task through the new visual route, added scoped context, saved it, reopened its Overview, and confirmed the compiled step plan. Desktop light and 390 × 844 light/dark layouts were visually inspected; console errors were zero. The temporary browser task was moved to Removed items and no native provider run was started.
- 187 Vitest tests across 29 files passed. Typecheck, formatting, source audit (131 reachable files, no broken imports), 16 offline native tests (four account-backed tests ignored by default), production web build, and final app/DMG packaging passed.

### Agent prompts and skills follow-up

- Added optional per-agent instructions and selection of up to 24 available Codex or Claude Code skills from the existing read-only capability inventory. Cached/disabled records are visible but not selectable, changing provider clears incompatible choices with an explicit notice, and saved choices are visible from Agent Activity.
- The native runtime now includes the agent prompt and requests selected skills by exact name for both performer and reviewer steps. It tells the provider to disclose a skill that cannot be loaded. AgentOS stores bounded metadata references only; it does not copy skill bodies, install skills, enable cached records, or treat the prompt as an approval boundary.
- Isolated Chromium verification created an agent with a custom prompt and the genuinely discovered personal `changelog-generator` skill, reopened it in the inspector and editor, confirmed persistence after reload, and confirmed provider-change clearing. The form and inspector were visually checked at 390 × 844; console errors were zero. No native company records or provider tasks were changed by this browser-only QA.
- 178 Vitest tests across 28 files passed. Added persistence validation and runtime compilation coverage for both performer and reviewer agents, including the missing-skill honesty instruction. Typecheck, formatting, whitespace checks, source audit (126 reachable files, no broken imports), and final app/DMG packaging passed.

### Company structure deletion follow-up

- Added permanent delete actions for agents, offices, and domains. Agent deletion is available from its Activity/configuration surface; office deletion is in Edit office; every domain card has an accessible action. Domain deletion cascades through its offices and agents, while deleted starter domains can be explicitly added again.
- Confirmations disclose cascade counts and affected project memberships. Project membership is cleaned automatically; historical Activity, memory, attachment copies, and project directories are retained.
- Deletion fails closed if affected agents are in an active native run or if any saved task references the entity through assignment, reviewer approval, handoff, or visual canvas. The dialog links active blocking tasks and directs users to restore archived/removed tasks before reassignment.
- Isolated Chromium checks passed for domain deletion persistence across reload, restoring a deleted starter domain, office cascade confirmation/cancel, successful agent deletion, and the disabled delete state for a referenced agent. Visually inspected that guarded dialog at 390 × 844. No native company records were changed by this browser-only QA.
- 176 Vitest tests across 28 files passed after adding structure-deletion coverage. Typecheck, formatting, whitespace checks, source audit (126 reachable files), and final app/DMG packaging passed.

### Attachments follow-up

- Added file picker, composer drop target, clipboard-image paste, removable file chips, inline previews, and attachment persistence for drafts, chats, and tasks. Supports PNG/JPEG/GIF/WebP, UTF-8 text/code, and locally extracted PDF text in the Mac app. Limits: eight files, 5 MB each, 20 MB combined, plus extracted-text limits. Scanned PDFs without extractable text and unsupported binaries are rejected with guidance.
- 172 Vitest tests across 27 files and 14 offline Rust tests passed; four live native tests remain opt-in. Typecheck, formatting, whitespace checks, source audit (124 reachable files), and final app/DMG build passed. Native tests cover immutable copies, provider-specific blocks, PDF extraction, limits, missing files, unsafe IDs, and symlink rejection.
- A real Codex request received a text file, a PDF, and an image: returned both unique file tokens and correctly described the orange-diamond app icon. Claude input-block formatting is tested, but successful Claude generation still requires reauthentication and has not been newly verified.
- Isolated Chromium checks passed for the actual file picker, DOM-dispatched file drop and image paste, removal, text/image previews, and draft reload persistence. Visually inspected image preview at 390px. DOM event tests do not establish Finder-to-WebKit dragging or macOS clipboard behavior.
- Created an isolated preview-only planned task from a prompt containing image and text attachments; both remained accessible in task details. No agent execution was triggered by that test.
- After explicit restart approval, installed and reopened `/Applications/AgentOS.app`. Its executable SHA-256 matches the packaged build. The previous app is preserved at `/private/tmp/agentos-attachments-backup.FvRsm0/AgentOS.app`; saved company data was not replaced. Native WebKit file-picker testing attached the repository icon. Subsequently observed the user's native chat successfully describe that image; left that conversation intact.
- Attachment copies stay in the local app-data runtime directory; selected files are shared with the chosen provider when sent or run. Removing a chip does not garbage-collect its copied bytes. Native OS drag/drop, clipboard paste, scanned-PDF OCR, office-document parsing, and exhaustive accessibility checks are not claimed as verified or supported beyond the documented scope.

### Daily-use design follow-up

- Start now keeps the engine visible, collapses model/effort configuration behind a labeled selection summary, removes an empty project selector, and makes planned-task safety explicit. Conversation titles use the saved prompt; assistant output renders safe Markdown with a Copy action.
- Sidebar navigation and settings remain fixed while the directory scrolls. Settings groups engine/notification setup, help, and appearance. Directory action popovers are viewport-positioned, focus the first action, support arrow keys/Escape, and close on focus departure. Keyboard paths were reviewed in code; complete assistive-technology validation remains outstanding.
- Tasks and Activity expose count-bearing status filters. Latest-task status is timestamp-derived; canceled runs are not false failures, and interruptions/approvals remain actionable. Removed misleading all-tasks-as-Planned counts, irrelevant Create menus, repeated storage labels, and default simulation controls. Team controls are progressively disclosed.
- Browser interaction checks: model disclosure, task checkbox/assignee visibility, recovering an existing preview-only task, Planned/Needs attention counts and empty views, Activity filters, narrow navigation, Settings, and dark appearance. Visually inspected desktop light mode and 390px dark Start/light Activity. The preview-only verification task was restored; no native records or project files were created for this QA.
- 168 tests across 26 files, typecheck, formatting, whitespace check, and source audit (119 reachable files, no broken imports) passed. Added coverage for latest-run ordering, waiting vs running, cancellation/interruption, Markdown semantics, blocked HTML/images/unsafe URLs, and safe external links.
- App and DMG builds succeeded. After explicit restart approval, installed `/Applications/AgentOS.app` with the previous bundle preserved in `/private/tmp/agentos-design-backup.a04pPC/AgentOS.app`. Native WebKit checks verified the new Start surface, available model/effort controls, and an existing real conversation with formatted lists/emphasis. No fresh provider request was needed. Clipboard success and a full keyboard/assistive-technology pass were not newly verified; these are engineering checks, not comparative user-study evidence.

### Sidebar and Start follow-up

- Start is separated from conversation routes (`#/chats/<id>`); conversations show prompts/replies only, with a scoped Activity link for logs and approvals.
- Browser checks: created a project from the sidebar, created a task in that project, archived/restored the project with its child visibility intact, and removed/restored a task using the directory menus. Removal uses an in-app confirmation and recoverable lifecycle state; no project directories or run history are deleted.
- Checked the directory drawer at 390px and 800px; restored the default viewport after testing. Desktop directory and compact drawer were visually inspected.
- Lifecycle tests cover persistence compatibility, project/child restore behavior, recoverable removal, active-run blocking, linked-task dependency pausing targets, and malformed metadata. Navigation tests cover scoped new-work/chat URLs and archived-chat exclusion from search.
- 160 Vitest tests, typecheck, formatting, and source audit passed before packaging. The app and DMG build succeeded.
- Installed and reopened `/Applications/AgentOS.app` after restart approval; the installed executable matches the packaged build SHA-256. Native WebKit checks confirmed that existing saved chats and the task remain in the sidebar, a saved chat opens as prompts/replies without event logs, its Activity link shows the matching execution history, and Start returns to a clean composer. The native Start page and directory were visually inspected. No new provider call was needed for these checks.

### Model and effort selection follow-up

- Native catalogs verified from both installed CLIs: five Codex entries and four Claude entries in this environment. This is metadata discovery, not a guarantee of generation access.
- Explicit Codex model/effort passed a real reply and same-session continuation test. Claude generation remains unverified after the earlier revoked-token response.
- Native WebKit check: selected GPT-5.6-Luna as a task default, then independently selected GPT-5.6-Sol with high effort for the Incident Investigator. The task remained Planned; no task execution was triggered by this UI check. A verification task was saved for inspection.
- Model choices and effort capabilities are live metadata; tests cover chat serialization, provider-separated defaults, reviewer and repeated-agent overrides, stable agent IDs, linked-task inheritance, canvas overrides, unavailable selections, and malformed persisted settings.
- 153 Vitest tests and nine offline native tests passed; typecheck, formatting, source reachability, real catalog discovery, and native app/DMG build passed. Responsive layouts beyond the current native window and successful Claude generation were not newly verified.

### Earlier runtime checks

- Real Codex chat response rendered in the installed `/Applications/AgentOS.app`, then remained available after reopening.
- A separate real Codex test passed a human start gate, reviewer-agent JSON approval, a structured-output conditional handoff, and rejection-before-execution.
- Typecheck, source reachability audit, formatting checks, and offline native tests passed. The live-provider tests remain opt-in because they use signed-in accounts.
- App and DMG packaging succeeded with `CI=true pnpm build:mac` (headless packaging avoids Finder styling automation).
- Claude transport reached the provider but received a revoked-token 401. Successful Claude replies, Claude action approvals, notification delivery, and long-duration cron behavior remain unverified.
- Advanced per-block resource/policy overrides remain blocked, not implemented. The feature matrix in Live execution lists these explicitly.

## Automated checks

- TypeScript: frontend/packages and server checks passed.
- Vitest: 131 tests passed across 22 files.
- Native Rust tests: 4 passed.
- Source audit: 99 source files reachable, no broken local imports or unreachable candidates under the audit's documented roots.
- Formatting check and Git whitespace check passed.
- Production web build and unsigned Apple Silicon `.app`/`.dmg` builds succeeded.

## Browser checks performed

- Six primary destinations and Company/Library subnavigation.
- Direct hashes, page reload, browser Back, and returning from alternate experiences.
- Global search: agent name plus engine, MCP navigation, and reopening a saved task.
- Keyboard search, Escape, inert dialog backgrounds, and focus restoration.
- Mobile navigation at 390px: all six text labels visible, dark appearance toggle, navigation closes after selecting a page, no page-width overflow on the checked Library view.
- Start: task creation through the prompt composer.
- Canvas: palette drag/drop, agent selection, custom prompt, click-to-connect ports, context resources, selector-based connections, Fit view, local persistence, and reopening the saved blueprint.
- `?studio`, `?data`, and `?workbench`: rendering smoke checks, no page exceptions or Vite error overlays. No live requests were submitted.

Visual artifacts are in ignored `output/playwright/`: `ux-start-light.png`, `ux-company-light.png`, `ux-mobile-dark.png`, `ux-mobile-navigation.png`, and `ux-canvas-dark.png`. These are test-workspace screenshots, not proof of connected engines or real work.

## Limits of this verification

This is engineering QA, not a user study, a formal accessibility certification, or exhaustive validation at every window size. The native app was built and its Rust tests were run; UI interactions were tested in Chromium, not a native WebKit session. Live execution, credentials, notification delivery, and real approval enforcement were not added or tested in this design/cleanup change. The source audit is conservative reachability checking, not a proof that every selector and export is used.
