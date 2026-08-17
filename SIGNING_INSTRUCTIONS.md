# MarkuprPlus signing and notarization

Signing is credential-dependent. The repository can build unsigned artifacts, but no artifact should be described as signed/notarized until the exact file is verified.

## Public and compatibility identities

- Product/bundle/executable display name: `MarkuprPlus`
- macOS bundle identifier: `com.eddiesanjuan.markuprx` (retained compatibility ID)
- Windows executable: `MarkuprPlus.exe`
- Session association extension: `.markuprx`
- macOS artifacts: `markuprplus-<version>-<arch>.dmg` and corresponding ZIP outputs
- Windows installer: `markuprplus-Setup-<version>.exe`

Do not change the bundle ID, extension, or registry compatibility keys merely to match public display branding.

## Unsigned local package

```bash
npm run build
npm run package:mac:unsigned
npm run verify:package
```

Unsigned output is for local validation. It is not a public trusted release.

## macOS credentials

Electron Builder and `scripts/notarize.cjs` expect credentials supplied by the environment/CI, including a Developer ID Application certificate and Apple notarization credentials. The repository must not contain certificate files or passwords.

Typical environment names used by the build/workflow include:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD` or the workflow's app-password secret
- `APPLE_TEAM_ID`

Use an app-specific Apple password. Store all values in the CI secret store or an ephemeral local environment, never `.env` committed to the repository.

Build an applicable target from `package.json`, then verify the exact output:

```bash
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/MarkuprPlus.app"
spctl --assess --type execute --verbose=4 "release/mac-arm64/MarkuprPlus.app"
xcrun stapler validate "release/markuprplus-3.0.0-arm64.dmg"
```

Repeat against every architecture/artifact intended for publication. For a universal app, verify the required x64 and arm64 slices as well as its signature.

## Windows credentials

Electron Builder derives the Authenticode publisher from the actual signing certificate common name. The config intentionally does not guess or hard-code a marketing publisher string.

Supply the certificate/password through the CI secret mechanism supported by Electron Builder. After building, inspect the signature and exact subject on the produced `MarkuprPlus.exe` and installer. A filename alone is not proof of signing.

The installer keeps compatibility registry keys but points commands/icons at the generated public executable through Electron Builder's executable macro.

## Release workflow

`.github/workflows/release.yml` is tag-triggered and contains credential-conditional signed/unsigned paths. Its presence does not prove that credentials, a successful notarization, or a published GitHub Release exists.

Before creating a tag:

1. Run the source, Electron, and package verification appropriate to the candidate.
2. Confirm package metadata, architectures, runtime asset allowlists, and artifact names.
3. Confirm CI secrets belong to the intended owner/team and are current.
4. Verify the signing certificate subject rather than assuming it from product branding.
5. After CI, download and independently verify every artifact/checksum/signature/notarization ticket.
6. Smoke-launch clean profiles on the intended architectures.

There is no generic release command in `package.json`. Use the explicit build/package/verifier commands and the reviewed workflow.

## Troubleshooting

- **No signing identity found:** inspect `security find-identity -v -p codesigning`; do not disable verification for a public release.
- **Notarization rejected:** inspect Apple's notarization log and fix the reported bundle/native/signature issue.
- **Unsigned artifact generated in CI:** confirm the credential-conditional branch and secret availability; do not publish it as signed.
- **Publisher mismatch on Windows:** inspect the actual certificate subject and build logs; do not hard-code a guessed publisher label.
- **Package verifier passes but signing fails:** package verification validates layout/brand/native content, not trust credentials. Both gates are required.

Never include private keys, certificate archives, passwords, notarization logs with secrets, or credential-bearing shell history in an issue.
