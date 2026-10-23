# Commercial release checklist — VOO Design

Honest gate list for shipping `umaxzhao/voo-design` as a commercially usable
local design app. Check items only when verified on the release candidate.

## Pre-release engineering

- [ ] Bump `package.json` `version` (semver) and note in CHANGELOG / release notes
- [ ] `npm test` green on the release commit
- [ ] `npm run build` (Vite) green
- [ ] `npm run dist` produces Linux AppImage under `release/`
- [ ] Optional: `npm run dist:all` for mac dmg/zip + win nsis/portable (signed hosts)
- [ ] Code signing: follow [code-signing.md](./code-signing.md) — **no secrets in git**
- [ ] Smoke-launch Electron (`npm run electron:dev` or packaged binary) on at least one OS

## Product gates (from product audit + parity matrix)

| Gate | Severity | Status note |
| --- | --- | --- |
| Multi-stop gradient + angle | Was ship-visible | Shipped on main via benchmark-parity (verify smoke) |
| Live Filter persist + panel + hot render | Affinity core | Shipped on main via benchmark-parity (verify image node) |
| Agent boolean / constraints / export | Pencil closure | Shipped on main via benchmark-parity (verify agent tools) |
| Browser FPS / paint timing | Perf claim evidence | Instrumentation via `npm run test:e2e:fps` (soft gate) |
| GL twins highPass / clarity / motionBlur | Perf for Affinity knobs | Track commercial-readiness PR |
| Crash recovery / error UI / large-image guard | Stability | Track commercial-readiness PR |
| Workspace / welcome file management | Ning priority #1 | **Cursor-owned** — require separate sign-off |
| Liquify / frequency separation / RAW | Deep Photo persona | Known gap — not a v1 Designer+basic Photo blocker |

## QA smoke

- [ ] zh + en UI load (locale switch); no raw i18n keys on error screen
- [ ] Open / save `.voo`; reopen matches
- [ ] Place a large image: friendly size-guard error (no OOM crash)
- [ ] Force a render error: error boundary shows reload + diagnostics copy
- [ ] Kill app mid-edit: crash draft recover prompt appears on relaunch (when enabled)
- [ ] Agent: boolean_combine, set_constraints, export_layers once each
- [ ] Affinity knobs: highPass / clarity / motionBlur on an image layer

## Release

- [ ] Tag `vX.Y.Z` on the release commit
- [ ] GitHub Release with AppImage (+ dmg/nsis when built)
- [ ] Release notes: features, known gaps (workspace Cursor line, Liquify/RAW, unsigned Linux)
- [ ] Verify artifact downloads; checksums optional

## Post-release

- [ ] Confirm no certs/API keys landed in the tag tree (`git grep` / secret scan)
- [ ] File follow-ups for remaining blockers above

### Release notes template

```markdown
## VOO Design vX.Y.Z

### Highlights
- …

### Packaging
- Linux AppImage (unsigned)
- macOS / Windows: see docs/code-signing.md when notarized builds are attached

### Known gaps
- Workspace file-management Cursor line (pending sign-off)
- Liquify / frequency separation / Camera RAW not in this release
```
