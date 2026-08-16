# Code Signing & Notarization Guide for MarkuprX

This guide explains how to set up Apple code signing and notarization for distributing MarkuprX.

## Why Code Signing Matters

Without code signing, macOS Gatekeeper will:
- Block the app from opening
- Show scary "unidentified developer" warnings
- Require users to go through Security settings to allow the app

With code signing AND notarization:
- App opens without warnings
- Users feel confident installing your app
- Apple has verified the app is free of malware

---

## Prerequisites

1. **Apple Developer Account** ($99/year)
   - Sign up at https://developer.apple.com
   - Required for distribution outside the Mac App Store

2. **Xcode Command Line Tools**
   ```bash
   xcode-select --install
   ```

---

## Step 1: Create Certificates

### Via Xcode (Recommended)

1. Open Xcode > Preferences > Accounts
2. Select your Apple ID > Manage Certificates
3. Click `+` and create:
   - "Developer ID Application" certificate

### Via Apple Developer Portal

1. Go to https://developer.apple.com/account/resources/certificates
2. Click `+` to create a new certificate
3. Select "Developer ID Application"
4. Follow the CSR (Certificate Signing Request) instructions
5. Download and double-click to install in Keychain

### Verify Installation

```bash
security find-identity -v -p codesigning
```

You should see your "Developer ID Application: Your Name (TEAM_ID)" certificate.

---

## Step 2: Create App-Specific Password

Apple requires an app-specific password for notarization (not your regular Apple ID password).

1. Go to https://appleid.apple.com
2. Sign in with your Apple ID
3. Navigate to "App-Specific Passwords"
4. Click "Generate Password"
5. Name it "MarkuprX Notarization"
6. **Save this password securely** - you'll need it for builds

---

## Step 3: Find Your Team ID

Your Team ID is a 10-character alphanumeric code.

### Method 1: Xcode
Open Xcode > Preferences > Accounts > Select your team > View the Team ID

### Method 2: Developer Portal
Go to https://developer.apple.com/account > Membership > Team ID

### Method 3: Command Line
```bash
security find-identity -v -p codesigning | grep "Developer ID"
# Output: ... "Developer ID Application: Your Name (ABCD1234XY)"
# Your Team ID is the part in parentheses: ABCD1234XY
```

---

## Step 4: Set Environment Variables

### For Local Development

Add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
# MarkuprX Code Signing
export APPLE_ID="your.email@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCD1234XY"
```

Then reload:
```bash
source ~/.zshrc
```

### For CI/CD (GitHub Actions)

Add these as repository secrets:
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_LINK` (base64-encoded .p12 certificate)
- `CSC_KEY_PASSWORD` (certificate password)

---

## Step 5: Export Certificate for CI

To sign in CI, you need to export your certificate as a base64-encoded .p12 file.

### Export from Keychain

1. Open Keychain Access
2. Find your "Developer ID Application" certificate
3. Right-click > Export
4. Save as `.p12` format
5. Set a strong password (this becomes `CSC_KEY_PASSWORD`)

### Convert to Base64

```bash
base64 -i Certificates.p12 -o certificate-base64.txt
```

The contents of `certificate-base64.txt` is your `CSC_LINK` secret.

---

## Step 6: Build & Sign

### Local Build

```bash
# Build the app
npm run build

# Package for macOS (will sign and notarize)
npm run package:mac
```

### Build Without Signing (for testing)

```bash
# Skip signing
CSC_IDENTITY_AUTO_DISCOVERY=false npm run package:mac
```

---

## Troubleshooting

### "No identity found for signing"

Your certificate isn't installed or recognized:
```bash
# Check installed certificates
security find-identity -v -p codesigning

# If empty, reinstall your certificate from Keychain
```

### "Notarization failed: invalid credentials"

1. Regenerate your app-specific password
2. Verify APPLE_ID matches your developer account email exactly
3. Check APPLE_TEAM_ID is correct

### "The signature is invalid"

The app was modified after signing:
```bash
# Verify signature
codesign --verify --deep --strict /path/to/markuprx.app

# Re-sign if needed
codesign --deep --force --verify --verbose --sign "Developer ID Application: Your Name" /path/to/markuprx.app
```

### "This app is damaged"

Gatekeeper quarantine issue:
```bash
# Remove quarantine attribute
xattr -cr /Applications/markuprx.app
```

### Notarization timeout

Apple's servers can be slow. The process typically takes 2-10 minutes but can take longer. The script will wait automatically.

---

## GitHub Actions CI Setup

Add this to your workflow:

```yaml
jobs:
  build-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Package & Sign
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
        run: npm run package:mac

      - name: Upload Artifact
        uses: actions/upload-artifact@v4
        with:
          name: markuprx-mac
          path: release/*.dmg
```

---

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `APPLE_ID` | Apple Developer account email | `dev@example.com` |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com | `xxxx-xxxx-xxxx-xxxx` |
| `APPLE_TEAM_ID` | 10-char Apple Team ID | `ABCD1234XY` |
| `CSC_LINK` | Base64-encoded .p12 certificate | (long string) |
| `CSC_KEY_PASSWORD` | Password for .p12 certificate | (your password) |

---

## Quick Reference Commands

```bash
# Build and package
npm run build && npm run package:mac

# Release (builds, signs, notarizes, publishes to GitHub)
npm run release

# Check what will be included in the package
npx electron-builder --mac --dir

# Verify signature
codesign --verify --deep --strict "release/mac/markuprx.app"

# Check notarization status
xcrun stapler validate "release/markuprx-0.2.0.dmg"
```

---

## Security Notes

- **Never commit** certificates, passwords, or keys to git
- Use environment variables or CI secrets only
- Rotate app-specific passwords periodically
- Keep your .p12 certificate file secure and backed up
