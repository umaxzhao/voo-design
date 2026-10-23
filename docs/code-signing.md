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
2. Materialize `CSC_LINK` as a temp file in the job; shred after the build.
3. Never echo secret values into logs.
4. Prefer separate mac / win signing jobs so Linux AppImage CI stays secret-free.

See also: [release-checklist.md](./release-checklist.md).
