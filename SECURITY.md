# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 3.x | Yes |
| < 3.0 | No |

The repository is currently source-available and has no published release artifacts. Security fixes target the current 3.x branch/candidate.

## Report a vulnerability privately

Do **not** open a public issue for a vulnerability or attach private recordings, screenshots, credentials, or proof-of-concept data to an issue.

Email **eddie@efsanjuan.com** with:

- a concise description and impact;
- affected commit/version and platform;
- minimal reproduction or proof of concept;
- whether sensitive user data or credentials may be exposed;
- a safe way to coordinate further details.

Ordinary bugs and feature requests belong in [GitHub Issues](https://github.com/hashfunction/MarkuprPlus/issues).

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
