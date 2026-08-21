# App Store Privacy and Compliance Answers

These answers describe the sandboxed Mac App Store build. Reconfirm them against the exact uploaded binary before submission.

## App Privacy

- Tracking: No.
- Data used for third-party advertising: No.
- Developer-operated analytics or telemetry: No.
- MarkuprPlus account or user identity collection: No.
- Data collected by Trieflow LLC from the app: None.
- User content stored by Trieflow LLC: None.

Recordings, narration, screenshots, transcripts, reports, preferences, and API keys are processed and stored on the user's Mac. When a user explicitly selects an optional third-party cloud provider, the app sends the material required for that user-requested provider operation directly to the provider. Trieflow LLC does not receive that material. Confirm App Store Connect's then-current definition of “collection” when entering the questionnaire; if Apple treats direct third-party transmission as collected data, disclose the applicable User Content and Audio categories for optional functionality.

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
