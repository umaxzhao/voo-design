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

## Signing stubs and skip behavior

All packaging scripts (`dist`, `dist:all`, `dist:dir`, `electron:build`) invoke
`scripts/signing-env.mjs` in the same process environment as electron-builder.
Without `CSC_LINK`, it sets `CSC_IDENTITY_AUTO_DISCOVERY=false`, preventing
macOS keychain discovery. Without either certificate variable it prints an
unsigned-build warning. `WIN_CSC_LINK` takes precedence over `CSC_LINK` for
Windows; `CSC_LINK` / `CSC_KEY_PASSWORD` are also electron-builder's Windows
fallback. Empty secrets count as absent. No certificate files are generated.

`build.mac.notarize=false` disables electron-builder's automatic notarization
so the `afterSign` hook owns the credential check and avoids duplicate submissions.
The hook only submits macOS apps when `CSC_LINK` and all three Apple credentials
are present. Partial Apple credentials skip notarization safely. It uses the
bundled `@electron/notarize`; if that module is unavailable it warns and skips.
With complete credentials, signing or Apple submission failures fail the build;
inspect the result before distributing. Hardened Runtime and inherited
entitlements remain configured for signed builds.

For platform-specific builds using the same preparation:

```bash
npm run build
node scripts/signing-env.mjs --mac dmg --publish never
# or on Windows:
node scripts/signing-env.mjs --win nsis --publish never
```

Direct `npx electron-builder` bypasses the wrapper's discovery guard. Prefer the
commands above for unsigned development. `CSC_IDENTITY_AUTO_DISCOVERY=false`
controls local identity discovery, not explicit certificate imports; there is
no separate project skip flag. To build unsigned, omit both certificate vars.

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

The real workflow is [release.yml](../.github/workflows/release.yml). Version
tags (`v*`) always build Linux AppImage, upload an Actions artifact, and attach
it to a GitHub Release using the scoped `GITHUB_TOKEN`. Manual dispatch can
also enable `build_mac` and/or `build_win`. Those optional jobs run on native
runners and receive certificate/Apple secrets through conditional environment
expressions; absent secrets are empty strings and yield unsigned builds.
Desktop installers are uploaded as Actions artifacts. Manual dispatch does not
create a release. Runner availability and the repository's Actions quota apply.

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
