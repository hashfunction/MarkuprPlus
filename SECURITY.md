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

## Credential-storage limitation

API-key storage attempts the OS credential service first and Electron `safeStorage` encryption second. If both fail, the current compatibility path can store a key in owner-only plaintext inside `secure-keys.json`; the file permission is tightened to mode `0600` on a best-effort basis, but that is not encryption.

Omit hosted API keys from MarkuprPlus when neither supported storage mechanism is available. Local Whisper and Local Rules do not need hosted keys; Ollama/LM Studio can use local services. CLI providers use their own authentication and may still communicate with their configured service.

Do not open, print, attach, or back up the fallback file while diagnosing storage. To request removal of stored OpenAI/Anthropic credentials without exposing their values, first back up any sessions you need, then use Settings → Advanced → Clear All Data. That action is intentionally destructive: it removes the configured output directory, attempts current/legacy keychain and fallback cleanup, and resets settings. Cleanup failures are best-effort and can be logged without failing the overall action, so completion is not proof that every credential backend erased its entry. [Troubleshooting](docs/TROUBLESHOOTING.md) explains how to locate the fallback and the legacy storage boundary safely.

Treat Settings Export as potentially sensitive. The current raw settings projection can carry legacy secret material from an older fallback path; do not publish, attach, or use an exported settings file as a general backup until that limitation is removed and independently verified.

## Scope examples

- capture/session/audio/transcript disclosure;
- credential/keychain/fallback-store exposure;
- XSS, command injection, unsafe generated HTML/PDF, or arbitrary file access;
- IPC/preload/navigation/permission-policy bypass;
- path traversal, symlink escape, unsafe deletion, or settings-import abuse;
- provider/delivery behavior that sends content without explicit user intent;
- malicious media or report input escaping validation;
- package/update/signature verification failures.

## Disclosure

Please allow time to reproduce, assess, patch, and verify an issue before public disclosure. Response and remediation timing depends on severity and reproducibility; this project does not promise a fixed SLA. Reporter credit is offered with consent after coordinated disclosure.
