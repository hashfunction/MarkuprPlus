# Code Signing & Notarization Guide for MarkuprPlus

This guide explains how to set up Apple code signing and notarization so
MarkuprPlus installs and launches without Gatekeeper warnings.

## Why Code Signing Matters

Without code signing and notarization, macOS Gatekeeper will:
- Refuse to open the app ("MarkuprPlus is damaged and can't be opened")
- Show "unidentified developer" warnings
- Force users through System Settings to allow the app

With code signing **and** notarization:
- The app opens on first launch with no warning
- Apple has scanned the build for malware
- The ticket is stapled, so it validates even offline

---

## Prerequisites

1. **Apple Developer Program membership** ($99/year)
   - Sign up at https://developer.apple.com
   - Required for distribution outside the Mac App Store

2. **Xcode Command Line Tools** (provides `codesign`, `notarytool`, `stapler`)
   ```bash
   xcode-select --install
   ```

---

## Step 1: Create a Developer ID Application Certificate

**This must be a "Developer ID Application" certificate.** It is the only
certificate type Apple will notarize for direct distribution.

| Certificate | Valid for |
|-------------|-----------|
| Developer ID Application | Direct distribution (DMG/ZIP) — **required here** |
| Apple Distribution | Mac App Store submission only |
| Apple Development | Local development only |

### Via Xcode (recommended)

1. Open Xcode > Settings > Accounts
2. Select your Apple ID > Manage Certificates
3. Click `+` and create **Developer ID Application**

### Via the Developer Portal

1. Go to https://developer.apple.com/account/resources/certificates
2. Click `+`, select **Developer ID Application**
3. Follow the CSR (Certificate Signing Request) instructions
4. Download and double-click to install into your keychain

### Verify Installation

```bash
security find-identity -v -p codesigning
```

You should see `Developer ID Application: Your Name (TEAMID1234)`. If you only
see `Apple Development` or `Apple Distribution`, the certificate above has not
been created yet and notarization will fail.

---

## Step 2: Choose a Notarization Credential

`notarytool` accepts either of these. The App Store Connect API key is
preferred for CI because it is scoped and does not expire with a password reset.

### Option A — App Store Connect API key (recommended)

1. Go to https://appstoreconnect.apple.com/access/integrations/api
2. Create a key with the **Developer** role
3. Download the `AuthKey_XXXXXXXXXX.p8` file (downloadable only once)
4. Note the **Key ID** and the **Issuer ID**

### Option B — Apple ID + app-specific password

1. Go to https://appleid.apple.com
2. Sign in, then open "App-Specific Passwords"
3. Generate one named "MarkuprPlus Notarization"
4. Note your 10-character **Team ID** (Developer Portal > Membership)

---

## Step 3: Local Signed Builds

Export the credentials for whichever option you chose:

```bash
# Option A - App Store Connect API key
export APPLE_API_KEY="$HOME/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="00000000-0000-0000-0000-000000000000"

# Option B - Apple ID + app-specific password
export APPLE_ID="your.email@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAMID1234"
```

Then build the full signed, notarized, stapled and verified release:

```bash
npm run release:mac
```

That script sets `MARKUPRX_REQUIRE_NOTARIZATION=1`, so it fails loudly rather
than quietly producing an unnotarized build. It runs:

1. `npm run build` — desktop, CLI, and MCP bundles
2. `electron-builder --mac` — signs both architectures, then the `afterSign`
   hook (`scripts/notarize.cjs`) submits each `.app` to Apple and staples it
3. `npm run verify:package` — checks artifact layout and native runtimes
4. `npm run notarize:dmg` — notarizes and staples each `.dmg`
5. `npm run verify:signing` — final Gatekeeper gate (see below)

### Unsigned local builds

```bash
npm run package:mac:unsigned
```

These are for local testing only and will not open on another machine.

---

## Step 4: CI Setup (GitHub Actions)

`.github/workflows/release.yml` runs on `v*` tags. It **fails the release**
rather than publishing artifacts macOS would block, so these secrets must be
configured before tagging.

### Required repository secrets

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` export of the Developer ID Application certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password set when exporting that `.p12` |

### Plus one notarization credential set

| Secret | Description |
|--------|-------------|
| `APPLE_API_KEY_P8` | Contents of the `AuthKey_XXXXXXXXXX.p8` file (raw PEM or base64) |
| `APPLE_API_KEY_ID` | App Store Connect Key ID |
| `APPLE_API_ISSUER` | App Store Connect Issuer ID (team keys only) |

*or*

| Secret | Description |
|--------|-------------|
| `APPLE_ID` | Apple Developer account email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | 10-character Apple Team ID |

### Optional

| Secret | Description |
|--------|-------------|
| `KEYCHAIN_PASSWORD` | Password for the runner's throwaway keychain. A random one is generated when unset. |
| `WIN_CSC_LINK` | Base64-encoded Windows code signing certificate |
| `WIN_CSC_KEY_PASSWORD` | Password for the Windows certificate |

### Exporting the certificate for CI

1. Open Keychain Access
2. Find **Developer ID Application: Your Name (TEAMID1234)**
3. Right-click > Export, save as `.p12`, set a strong password
   (this becomes `APPLE_CERTIFICATE_PASSWORD`)
4. Base64-encode it:

   ```bash
   base64 -i Certificates.p12 | pbcopy
   ```

5. Paste the result into the `APPLE_CERTIFICATE` secret

Export the API key the same way if using Option A:

```bash
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
```

---

## Step 5: Verifying a Release

`npm run verify:signing` is the gate that decides whether a build is safe to
publish. For every `.app` it checks that:

- the signature is valid and unbroken (`codesign --verify --deep --strict`)
- it is signed by a **Developer ID Application** certificate
- the hardened runtime is enabled and a Team ID is embedded
- every loose Mach-O binary under `Contents/Resources` is signed — this covers
  the unpacked whisper.cpp runtime and native addons, which `--deep` does not
  traverse and which are the usual cause of a notarization rejection
- a notarization ticket is stapled (`xcrun stapler validate`)
- Gatekeeper reports `source=Notarized Developer ID` (`spctl --assess`)

For every `.dmg` it checks that a ticket is stapled and Gatekeeper accepts it.

Run it against any release directory:

```bash
npm run verify:signing
```

---

## Troubleshooting

### "No identity found for signing"

```bash
security find-identity -v -p codesigning
```

If this is empty, or only shows `Apple Development` / `Apple Distribution`,
create a Developer ID Application certificate (Step 1).

### "Notarization failed: invalid credentials"

1. Regenerate the app-specific password, or re-download the API key
2. Verify `APPLE_ID` exactly matches the developer account email
3. Verify `APPLE_TEAM_ID` matches the team on the certificate
4. For **individual** API keys, omit `APPLE_API_ISSUER` — sending it returns 401

### Finding out why Apple rejected a build

```bash
xcrun notarytool history --apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID"
xcrun notarytool log <submission-id> --apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID"
```

The log names each offending file. The most common causes are a nested binary
that is unsigned or missing the hardened runtime.

### "The signature is invalid"

The bundle was modified after signing. Rebuild from a clean `release/`
directory rather than re-signing in place.

### "This app is damaged and can't be opened"

This is the Gatekeeper message for an unsigned or unnotarized download. It
means the release was published without notarization. Removing quarantine
locally (`xattr -cr /Applications/MarkuprPlus.app`) hides the symptom on your
own machine but does nothing for users — fix the release instead.

### Notarization timeout

Apple's service normally takes 2-10 minutes but can be slower. `notarytool
--wait` blocks until a verdict is returned.

---

## Security Notes

- **Never commit** certificates, `.p8` keys, passwords, or `.p12` files
- Use environment variables or CI secrets only
- Rotate app-specific passwords periodically
- Keep the `.p12` export backed up securely; certificates cannot be re-downloaded
