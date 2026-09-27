# Data workbench

The default screen is an asset-level workbench, not a live observability service.
Its job is to gather the dependency and test context a data engineer otherwise
has to copy into an agent conversation manually.

## Try it locally

Run `npm run dev`, then open http://127.0.0.1:4173/.

1. Explore the explicitly labeled commerce example. Select `fct_revenue` and inspect its test evidence and downstream dependencies.
2. Click **Investigate with context**, **Plan a change**, **Review model**, or **Build something new**. Review or export the generated Markdown brief. Example data cannot launch a real contextual run.
3. Import your project's `target/manifest.json`, optionally together with `target/run_results.json`. Both must describe the same code revision; different invocation IDs trigger a warning. No warehouse credentials are needed.
4. Choose the local repository, specialist, and optional skills. Read the exact brief and start an agent review. The review endpoint explicitly classifies this as a read task, regardless of words in imported metadata.
5. Follow actual activity, questions, permission requests, failures, and the final answer in **Agent work**. Existing runs remain available. Agent characters open real role history.

The existing multi-agent project execution, memory, agent creation, and skill
creation screens remain at `/?studio=1`. The DataGuild logo returns to the canvas.
Building from the new canvas currently produces a design/review brief, not an
automatic production deployment. Implementation remains an explicit separate task.

## Truth and limits

- Lineage is transitive `depends_on.nodes` traversal. Impact means possible dependency impact, not a proven outage. Unknown/missing dependencies are not fabricated.
- Results join by `unique_id`; unreported results remain unknown. A failed attached test marks its parent model for attention even when model execution succeeded. A passing run does not establish source freshness.
- Imported artifacts are snapshots. Airflow, Snowflake, Monte Carlo, Sigma, and remote GitHub are not connected. dbt exposures may describe dashboards, but do not prove live usage.
- The compact catalog is browser-local (`dataguild:catalog:v1`). It retains metadata and up to 80 columns per asset, not raw/compiled SQL. Import replaces the previous snapshot, not run history. The Connections screen can remove the snapshot.
- Starting a run sends the previewed context to the configured Codex runtime/provider. Artifact descriptions are explicitly labeled untrusted data. The existing runtime starts in its read-only sandbox; any permission request must still be reviewed. A model's textual verdict is not equivalent to executed data tests.
- Limits: 25 MB per file, 5,000 assets, 4 MB normalized browser storage. The canvas initially renders 24 assets with search, downstream filtering, and a load-more action. Briefs have bounded dependency excerpts and explicitly label omitted items.
- No WebGL, animation framework, font download, or additional runtime library is required. Character animation occurs only for actual active work and respects reduced motion.

Artifact schemas: [dbt manifest](https://docs.getdbt.com/reference/artifacts/manifest-json), [dbt run results](https://docs.getdbt.com/reference/artifacts/run-results-json).

## Checks

`npm run typecheck`, `npm test`, and `npm run build` cover the application and artifact logic.
`apps/desktop/server/catalog.test.ts` covers joining, missing evidence, cycles,
cross-project files, provenance, impact, and brief boundaries. The small artifacts
in `output/playwright/fixtures/` are synthetic QA inputs, not production data.
