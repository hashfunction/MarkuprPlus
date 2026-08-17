# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 3.x | Yes |
| < 3.0 | No |

The repository is currently source-available and has no published release artifacts. Security fixes target the current 3.x branch/candidate.

## Request private vulnerability coordination

Private vulnerability reporting is not yet configured for this repository, and the project does not currently publish a verified private security mailbox. Do not post sensitive details, private recordings, screenshots, credentials, exploit steps, or proof-of-concept data in a public issue.

As an interim coordination step, open only a [minimal Contact issue](https://github.com/hashfunction/MarkuprPlus/issues/new) requesting a private channel. Include no vulnerability details; state only that you need private security coordination and how the current maintainer can reach you through a channel you control. If even that disclosure is unsafe, wait until this policy publishes a verified private route.

After a maintainer establishes a private channel, be ready to provide:

- a concise description and impact;
- affected commit/version and platform;
- minimal reproduction or proof of concept;
- whether sensitive user data or credentials may be exposed;
- a safe way to coordinate further details.

Ordinary bugs and feature requests belong in [GitHub Issues](https://github.com/hashfunction/MarkuprPlus/issues).

## Credential and settings boundary

New API-key saves try the OS credential service first and genuinely protected Electron `safeStorage` second. New credential writes fail closed if neither is available, and no plaintext credential is written. On Linux, Electron's unprotected `basic_text` backend is not accepted as secure storage. Local Whisper and Local Rules do not need hosted keys; Ollama/LM Studio can use local services. CLI providers use their own authentication and may still communicate with their configured service.

Legacy profiles can contain credential material from previous plaintext or unprotected fallback formats. MarkuprPlus migrates a legacy value only after writing and reading it back through a protected destination. It then attempts to remove the legacy source; if cleanup fails, the source is retained and migration cleanup is retried on a later credential access. Never open, print, attach, or back up legacy credential files while diagnosing storage.

Renderer settings responses and Settings Export use an allowlisted public settings projection that excludes secrets, encrypted blobs, and unknown/internal persisted fields. Settings import rejects unknown or internal keys and validates the complete file before applying any value.

Settings → Advanced → Clear All Data removes only verified app-owned session directories and leaves the configured root, unrelated children, and symlink targets intact. It still attempts every current and legacy credential backend, recovery cleanup, and settings reset even if one step fails. The result reports a stable partial-failure category and permits retry; completion is not proof that every OS credential backend erased its entry. Back up needed session output first. [Troubleshooting](docs/TROUBLESHOOTING.md) explains safe cleanup and compatibility paths.

## Scope examples

- capture/session/audio/transcript disclosure;
- credential/keychain/legacy-store exposure;
- XSS, command injection, unsafe generated HTML/PDF, or arbitrary file access;
- IPC/preload/navigation/permission-policy bypass;
- path traversal, symlink escape, unsafe deletion, or settings-import abuse;
- provider/delivery behavior that sends content without explicit user intent;
- malicious media or report input escaping validation;
- package/update/signature verification failures.

## Disclosure

Please allow time to reproduce, assess, patch, and verify an issue before public disclosure. Response and remediation timing depends on severity and reproducibility; this project does not promise a fixed SLA. Reporter credit is offered with consent after coordinated disclosure.
