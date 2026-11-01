# Code signing (commercial builds)

VOO Design ships unsigned AppImages by default on Linux CI/dev boxes. macOS and
Windows notarization/signing are **optional hooks** wired through
`electron-builder` environment variables. **Never commit certificates, `.p12`,
`.pfx`, provisioning profiles, or passwords to this repository.**

## macOS (Developer ID)

| Env var | Purpose |
| --- | --- |
| `CSC_LINK` | Path or base64 of the `.p12` / `.pfx` Developer ID Application cert |
| `CSC_KEY_PASSWORD` | Password for `CSC_LINK` |
| `APPLE_ID` | Apple ID used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password (not the account password) |
| `APPLE_TEAM_ID` | Team ID for notarization |

`package.json` → `build.mac` enables `hardenedRuntime` and points
`entitlements` / `entitlementsInherit` at `build/entitlements.mac.plist`.

Example (local machine only):

```bash
export CSC_LINK="/secure/path/developer-id.p12"
export CSC_KEY_PASSWORD="…"
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="…"
export APPLE_TEAM_ID="XXXXXXXXXX"
npm run dist:all
# or: npx electron-builder --mac dmg
```

Apple trust checks retain the actual exit code, timeout and public tool
diagnostic. A known network loss or process timeout gets at most three attempts
with a 90-second command deadline. Invalid/missing tickets and policy rejection
still fail immediately. If the bundled notarizer already obtained acceptance
but exhausted its staple network retries, only stapling is retried; credentials
are not resubmitted. A passing receipt always requires successful real staple
validation and Gatekeeper assessment after the retry.

## Windows (Authenticode)

| Env var | Purpose |
| --- | --- |
| `WIN_CSC_LINK` | Path or base64 of the Windows code-signing cert |
| `WIN_CSC_KEY_PASSWORD` | Password for `WIN_CSC_LINK` |
| `CSC_IDENTITY_AUTO_DISCOVERY` | Set `false` to skip auto discovery when unsigned |

```bash
export WIN_CSC_LINK="/secure/path/windows-codesign.pfx"
export WIN_CSC_KEY_PASSWORD="…"
npx electron-builder --win nsis
```

## Linux

AppImage and `.deb` targets are typically **unsigned**. Distribution stores
(Snap/Flatpak) apply their own signing. No secrets are required for
`npm run dist` (AppImage) on this project.

## CI recommendations

1. Store certs in the CI secret store (GitHub Actions encrypted secrets, etc.).
2. Supply `CSC_LINK` as a base64 CI secret; electron-builder manages its temporary import.
3. Never echo secret values into logs.
4. Prefer separate mac / win signing jobs so Linux AppImage CI stays secret-free.

See also: [release-checklist.md](./release-checklist.md).

## Unsigned previews and required signed builds

The normal packaging wrapper retains explicit unsigned preview behavior when
certificate variables are absent. Empty Actions secrets count as absent.
A Windows certificate or Apple credentials alone never enables Mac identity
discovery. An explicitly requested signed Mac build sets
`VOO_MAC_SIGNING_REQUIRED=1` and `forceCodeSigning=true`; missing identity,
credentials, notarization tools or trust verification fails the build.

The `afterSign` hook supports exactly one authentication route:

- Existing `APPLE_KEYCHAIN_PROFILE`, optionally with `APPLE_KEYCHAIN`.
- `APPLE_API_KEY` (existing private-key path), `APPLE_API_KEY_ID` and
  `APPLE_API_ISSUER`, matching VOO-Run's App Store Connect route.
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`.

`build.mac.notarize=false` prevents duplicate submissions: this hook owns
notarization and uses the already locked `@electron/notarize` dependency.
Required builds check the expected Developer ID team and Hardened Runtime
before submission, then validate the stapled app and Gatekeeper assessment.
No private key or certificate is exported or imported by this local route.

## Reuse an existing release configuration

Only supply a credential configuration file after its owner explicitly
permits the build tool to use it. The wrapper never searches for `.env` or
loads a repository configuration by default. It loads only allowlisted Apple
authentication fields, preserves exported values, resolves relative key paths
against the configuration directory, never evaluates shell expressions and
redacts credential values from child diagnostics. Unrelated provider keys
are not passed to the build. The private-key file is read by Apple's normal
authentication tool, not copied into source, packages or evidence.

```bash
VOO_RELEASE_CREDENTIALS_FILE=/path/to/approved/voo-run/.env \
  npm run release:mac-signed -- arm64
```

Run the x64 target on an Intel Mac runner. The native-architecture guard stays
in place; an arm64 build is not an Intel pass. `VOO_APPLE_TEAM_ID` selects the
expected existing identity if several are available. The wrapper preflights
Apple authentication without logging history contents, retains DMG and ZIP,
runs actual packaged smoke and records separate sanitized signing evidence.
Cross-repository runners record the checked-out app commit, not the signing
workflow repository's commit.

A signed release must assemble with the additional guard:

```bash
GITHUB_SHA=<verified-app-commit> node scripts/assemble-desktop-release.mjs \
  desktop-artifacts release-ready --require-mac-signing
```

Both matching-commit/architecture Mac trust receipts and the corresponding
native smoke evidence are mandatory. A stale, partial or unsigned receipt
fails; old unsigned Beta1 remains unchanged. This gate certifies the app's
signature, stapling and Gatekeeper assessment, not manual installer interaction
or upgrades from an older installation.

## GitHub Actions secrets and releases

Create these repository or organization Actions secrets under Settings →
Secrets and variables → Actions. Never commit their values:

| Secret | Value |
| --- | --- |
| `CSC_LINK` | Base64-encoded macOS Developer ID Application certificate export |
| `CSC_KEY_PASSWORD` | Password protecting that export |
| `WIN_CSC_LINK` | Base64-encoded Windows Authenticode certificate export |
| `WIN_CSC_KEY_PASSWORD` | Password protecting that export |
| `APPLE_ID` | Apple account email for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific notarization password |
| `APPLE_TEAM_ID` | Apple Developer team ID |

Base64 is encoding, not encryption: keep the complete encoded value in the
secret store. Electron-builder imports it into temporary signing storage; no
manual decoding or repository certificate file is needed. Do not echo it.

The workflow is [release.yml](../.github/workflows/release.yml). Tag pushes and
manual dispatch build Windows x64, Linux x64, macOS Intel and Apple Silicon on
four native runners. `create_draft=true` on a manual run (or a version tag)
assembles a **draft prerelease** only after checks, packaging inspection and
native smoke succeed on all four targets. No job automatically publishes it.

Every target runs `npm run release:build -- <platform> <arch>`, including
Electron-mode assets and connector preparation, then `release:smoke`. macOS
uses its native `en`/`zh_CN` framework language identifiers. Missing required
transitive dependencies or connector resources fail package inspection.

Each job uploads installers, generated update metadata/blockmaps and its
native evidence. The draft job merges both Mac architectures without replacing
either update payload, verifies SHA-512 references and writes SHA256SUMS.txt.
Its release-write permission is separate from read-only build jobs. Existing
releases are never overwritten. Desktop artifact names contain no spaces;
Windows setup and portable executables have distinct names.

Absent signing secrets produce unsigned previews, explicitly disclosed in the
release notes. This smoke checks packaged startup, trusted pointer drawing and
undo/redo, actual filesystem IPC, cancellation of dirty quit without losing
the bridge, and physical project reopening in a fresh process/profile. The OS
picker/confirmation results are automated; interactive installer UX, OS trust,
real authenticated services and old-version updating need separate acceptance.

Native runner labels are pinned using the [GitHub runner reference](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job).
Beta metadata uses an explicit publish channel, following the [electron-builder channel guidance](https://www.electron.build/v26/docs/tutorials/release-using-channels/).

## Smoke checklist

- Run `npm ci`, `npm test`, `npm run build`, and `npm run dist -- --publish never`
  without signing variables on Linux; confirm the warning and runnable AppImage.
- On macOS with the full macOS secret set, build a DMG; verify the app using
  `codesign --verify --deep --strict --verbose=2`, `spctl --assess --type execute`,
  and `xcrun stapler validate` (supply the app path to each). Confirm the hook
  submits and staples successfully.
- On Windows with Windows secrets, build NSIS; use PowerShell
  `Get-AuthenticodeSignature` on the installer and installed executable and
  confirm `Status` is `Valid` and the publisher is correct.
- Test both desktop platforms without certificates and with partial Apple
  credentials; confirm missing credentials never cause signing lookup failures.
- Unsigned macOS downloads may be blocked by Gatekeeper. Signed/notarized apps
  should pass policy checks. Windows SmartScreen reputation is separate from
  signature validity and may still warn for a new publisher or binary.
- Review staged changes, git history, and CI logs for credentials or certificate
  material. Confirm no secrets, `release/`, or `node_modules/` are committed.
