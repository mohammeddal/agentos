# Public source preparation audit

Date: 2026-10-05 (America/Los_Angeles). Baseline: `dea8856`; release preparation builds on the existing 65-commit repository history.

## Credentials and publication scope

- Gitleaks **8.30.1**, downloaded from the official release and verified against its SHA-256 checksum, scanned **all 65 existing commits** with redacted output: **no findings**.
- A second scan covered tracked files and non-ignored untracked files eligible for publication, including these release additions: **no findings**. Both scans are reproducible using `pnpm check:secrets`.
- No provider auth file, environment file, local runtime store, or credential file was tracked. Private `.agentos/`, `.staffforge/`, caches, installers, and provider configuration stay local and ignored. Personal provider credential stores outside the repository were not scanned or copied.
- Publication guards reject private/generated paths, symlinks, oversized assets, and URLs containing embedded credentials. Four regression tests cover path exclusions, allowed source assets, redacted error messages, and symlink rejection.
- Documentation screenshots were freshly captured in an isolated browser session and visually reviewed. No personal work or provider run was included. See [image provenance](images/README.md).

This is a source-publication check, not proof that all possible credentials or security flaws are absent. Scanners have false negatives; binary assets need human visual review. If a real credential is discovered later, rotate it and review history before another push.

## Dependency changes

The initial npm audit reported five advisories: two moderate Vitest/mocker findings, one high `source-map-js` finding, and two critical `tinypool` findings. Updating Vitest to **4.1.11** removed the vulnerable worker dependency; updating the transitive `source-map-js` resolved the remaining finding. The final `pnpm audit` reported **zero known vulnerabilities**. The lockfile is committed and frozen installation passed.

## Verification performed

| Check                             | Result                                                           |
| --------------------------------- | ---------------------------------------------------------------- |
| Repository guard regression tests | 4 passed                                                         |
| TypeScript and server typecheck   | Passed                                                           |
| Vitest source tests               | 271 passed across 45 files                                       |
| Rust native tests                 | 23 passed; 4 account-backed tests intentionally ignored          |
| Source reachability               | 172 files reachable; no broken imports or unreachable candidates |
| Formatting and Git whitespace     | Passed                                                           |
| Production web/package build      | Passed                                                           |
| Native macOS app build            | Unsigned `AgentOS.app` built successfully                        |
| npm dependency audit              | Zero known vulnerabilities                                       |
| Gitleaks history/current files    | No findings                                                      |

Local verification used Node 23.6.0, pnpm 9.15.2, and the installed Rust toolchain. CI is configured to repeat source checks on Node 22 LTS and compile/test the native app on macOS. This record describes local results; GitHub Actions provides the independent remote result after publication.

## Organization and documentation

The public repository adds an MIT license, screenshot-led README, current user guide, contribution/security/release guidance, issue and pull-request templates, Dependabot, and CI with pinned action commits. The root package is named `agentos`; internal package names and native storage IDs are preserved.

The unreferenced earlier task form and its exclusive stylesheet were removed after import/export checks. The active workflow editor and retained legacy experiences remain. Recovery evidence is in [Cleanup](CLEANUP.md).

## Remaining release limits

- Public source readiness does not imply a security-audited production binary. Signing, notarization, native CSP hardening, and Rust dependency-advisory review remain outstanding.
- Live provider generation was not rerun; tests requiring signed-in accounts stayed disabled. No claim is made about current provider quota, authentication, or every third-party integration.
- Browser screenshots used alternate loopback port 4175 because 4173 was occupied. Engine discovery returned the expected 403 from fixed-origin checks on that port; screenshots show offline/demo state. Native generation and private provider configuration were not accessed.
- Vite reports a large JavaScript chunk warning. The build passes, but further code splitting is still an optimization opportunity.
- This release does not claim native Windows/Linux verification, automatic updates, closed-app scheduling, or encrypted local storage.
