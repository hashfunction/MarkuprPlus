# App Store Privacy and Compliance Answers

These answers describe the sandboxed Mac App Store build. Reconfirm them against the exact uploaded binary before submission.

## App Privacy

- Tracking: No.
- Data used for third-party advertising: No.
- Developer-operated analytics or telemetry: No.
- MarkuprPlus account or user identity collection: No.
- Data received or stored by Trieflow LLC from the app: None.
- User content stored by Trieflow LLC: None.
- App Store privacy data types: Photos or Videos and Other User Content.
- Purpose: App Functionality only.
- Linked to the user's identity: Yes, conservatively, because optional Anthropic API analysis uses the user's own provider API key and Anthropic retains API inputs and outputs under its then-current commercial retention policy.

Recordings, narration, screenshots, transcripts, reports, preferences, and API keys are processed and stored on the user's Mac. When a user explicitly selects Anthropic API analysis, the app sends the transcript and selected screenshots directly to Anthropic using the user's own key; Trieflow LLC does not receive that material. The App Store label therefore conservatively discloses Photos or Videos and Other User Content as Data Linked to You and used for App Functionality. OpenAI audio transcription currently has no abuse-monitoring or application-state retention according to OpenAI's endpoint-specific data-controls documentation, so Audio Data is not listed as collected under Apple's current definition. Reconfirm both providers' retention policies before each submission.

## Permissions

- Screen Recording: required to capture the user-selected window, region, or display.
- Microphone: optional narration recorded only during a user-started capture.
- User-selected file read/write: used for exports chosen through system dialogs.
- Outgoing network: optional provider requests, local model endpoints, model data downloads, and support links.
- Camera, Contacts, Calendars, Photos, Location, Bluetooth, HomeKit, Health, and advertising identifiers: not used.

## Age Rating

Expected lowest available rating. The app contains no violence, sexual content, profanity supplied by the developer, gambling, contests, alcohol/drug/tobacco references, horror themes, medical treatment content, social networking, unrestricted web browsing, or user-to-user communication. User-created narration and captures remain private local content.

## Encryption Export Compliance

The app uses HTTPS/TLS and encryption supplied by Electron, Node.js, macOS Keychain, and provider SDKs. It does not implement a proprietary encryption algorithm. Answer the App Store Connect export-compliance questions consistently with the final Info.plist declaration and Apple's current exemption guidance; do not upload separate documentation unless App Store Connect requests it.

## Content Rights

MarkuprPlus displays only app-owned interface assets and content captured or imported by the user. The user controls rights to captured material. Named AI coding agents and optional providers are referenced solely for compatibility; no endorsement is claimed.
