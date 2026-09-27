# AgentOS design contract

## Chosen direction: quiet operational workspace

The user's primary job is to start work, find it again, and understand what needs attention. The company metaphor helps organize work; it must not require learning a game or opening multiple dashboards first.

Three directions were considered (1–5, higher is better):

| Direction                   | Clarity | Distinctiveness | Audience fit | Feasibility | Scale | Narrow screens |
| --------------------------- | ------- | --------------- | ------------ | ----------- | ----- | -------------- |
| Quiet operational workspace | 5       | 3               | 5            | 5           | 5     | 5              |
| IDE-style dense cockpit     | 3       | 3               | 4            | 4           | 5     | 2              |
| Spatial company-first map   | 3       | 5               | 4            | 4           | 3     | 2              |

Choose the quiet workspace. The IDE direction is the fallback for expert-only tools such as the canvas. Keep the spatial map as an optional Company view, not the required home screen. Both alternatives expose too much structure before a user has work to do.

## Navigation

- Six stable destinations: Start, Tasks, Projects, Company, Activity, Library.
- Company owns Office map, Offices, Agents, Domains. Library owns Memory and Engine capabilities.
- One relevant primary create action per page. Other creation actions live under Create….
- Cmd/Ctrl+K opens Find anything. Page search filters only the current destination.
- Small screens get the same destinations in a labeled navigation dialog, never an inaccessible hidden sidebar.
- Hash routes retain location on refresh and support browser navigation. Do not silently navigate users home after a reload.

## First viewport and progressive disclosure

Start shows a prompt, a task checkbox, the selected engine, and project context when projects exist. Model and effort controls are one click away behind a summary of the current choices. Saved chats live in the sidebar, not a competing panel on Start. Chats open on their own routes and show readable replies; logs stay in Activity. Avoid welcome banners, promotional subtitles, empty metrics, or parallel “start” actions.

Task detail is for understanding work; Edit task is for configuration. Schedules and structured handoffs remain separate tabs. The canvas is a deliberate second-level tool with Work, Resources, and Control groups, selected-block settings, and Fit view. Selector-based connections remain available behind an explicit disclosure. Never make mouse dragging the only path.

Each view should answer: where am I, what is here, what can I do next? Show advanced fields after the user chooses the relevant object or option. Keep important safety states visible, but avoid repeating the same paragraph in three places.

## Visual vocabulary

- System sans-serif typography, restrained sage accent, neutral surfaces, light and dark tokens.
- Page heading around 28px; content 12–14px; metadata 10–12px. Do not shrink critical instructions to decorative microtype.
- Use an 8px-based spacing rhythm; 20–32px between sections, 8–12px within controls.
- Use existing `--co-*` tokens. Shadows belong to floating dialogs and menus; gradients and large decorative panels are unnecessary.
- Active navigation uses both shape/background and text weight. Do not encode approval or error status by color alone.
- Motion should explain a change. Respect reduced-motion preferences; no fabricated activity animation.
- No new bitmap assets are needed. The work itself is the visual content.

## Interaction and accessibility

- Every icon-only control needs an accessible name; collapsed navigation also needs tooltips.
- Dialogs restore focus, trap Tab only among visible controls, and make background surfaces inert.
- Global search supports Arrow keys, Enter, and Escape. It must not discard an open form.
- Buttons remain labeled on mobile. Long company names, empty states, filtered-no-results states, and unavailable references must remain usable.
- Preserve data during navigation and edits. Auto-save status must distinguish durable storage from session-only failure.
- Test at desktop, compact desktop, and 390px widths in light and dark modes. These checks are engineering evidence, not a substitute for usability testing with people.

## Daily-use interaction contract

The core loop is **start → review → continue → find again**. Company configuration is supporting work, not a prerequisite for every conversation.

| User decision              | Control and location                                           | Why                                                                                                                 |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Ask a question             | Start composer with one Send action                            | The lowest-friction path needs no team setup.                                                                       |
| Make an actionable plan    | “Make this a task” checkbox                                    | One independent choice reveals assignee and approval context. Creating a plan must not silently execute it.         |
| Choose a provider          | Engine dropdown in the composer                                | A consequential choice remains visible before sending. Existing chats keep their provider.                          |
| Change model or effort     | Labeled disclosure with current selections, then dropdowns     | Available without forcing every user through settings. Provider catalog errors remain explicit.                     |
| Choose project context     | Project dropdown, preselected when starting from a project     | Keep the destination visible; omit an empty dropdown when no projects exist.                                        |
| Find saved work            | Searchable sidebar tree plus Cmd/Ctrl+K                        | Resume work without scanning a dashboard. Sidebar navigation stays fixed; only the directory scrolls.               |
| Archive, remove, restore   | Item three-dot menu                                            | Infrequent management actions stay out of the primary path. Remove requires confirmation and retains files/history. |
| Find a blocked run         | Activity “Needs attention” filter, plus sidebar approval count | Pending decisions and errors are actionable, not buried in decorative metrics.                                      |
| Review finished work       | Activity or Tasks “Finished” filter                            | Runtime state comes from recorded runs, not the existence of a task record.                                         |
| Adjust appearance or setup | Settings & help in sidebar footer                              | Engines, notifications, theme, and help are occasional preferences.                                                 |
| Build complex coordination | Task detail → edit, workflow, or visual builder                | Start simple; configure schedules, conditions, and per-agent models in context.                                     |

### Readability and trust

- Assistant replies render safe Markdown with a Copy action. Raw HTML is ignored, images do not auto-fetch, and only explicit HTTP(S)/mailto links can navigate out. Event logs remain plain evidence, not executable content.
- “Running” excludes runs waiting for approval. “Needs attention” includes approvals, failed/interrupted runs, and errors. User-canceled runs are finished, not mislabeled as failures requiring attention.
- Task status uses the newest recorded run by timestamp, independent of backend array order. A task without runs is Planned.
- Simulations are an explicitly selected Activity view, not a competing default action. Team inspection and task restrictions sit behind a labeled disclosure.
- Menus move above their trigger if necessary, support arrow keys and Escape, and close when focus leaves. The narrow-screen navigation retains labels, search, projects, and settings.

### Remaining validation, not promises

This is a design and engineering pass, not evidence of superiority over another product. Validate the core loop with people using real projects: can they send their first chat, find a previous reply, plan a task without accidentally starting it, find an approval, and restore archived work without help? Test larger workspaces and assistive technology before declaring the navigation complete. Provider authentication, policy enforcement, and scheduler limits remain documented in LIVE-EXECUTION.md; visual polish must not imply those limits disappeared.

## Truthfulness is part of the design

Plans are not runs. Disconnected is not idle. A discovered connector is not authenticated. A rehearsal approval is not runtime permission. Canvas restrictions are policy intent until enforced by a trusted dispatcher. Keep those boundaries explicit wherever the user might otherwise act on an incorrect assumption.
