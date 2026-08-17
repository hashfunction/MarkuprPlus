# MarkuprPlus export formats

MarkuprPlus has two related output systems:

- the desktop Review Editor exports Markdown, PDF, HTML, or JSON;
- the compatible CLI renders `markdown`, `json`, `github-issue`, `linear`, or `jira` templates.

These lists are intentionally different. The CLI does not currently register an `html` template; HTML is a desktop Review export.

## Desktop Review export

### Markdown

Best for source control, coding agents, and editable handoff. A report includes session metadata, summary, findings, classifications, evidence references, and MarkuprPlus attribution.

When **Include images** is enabled, validated screenshots are copied into a contained relative assets directory and referenced from the document. When disabled, screenshot content/references are removed from the export. Absolute or escaping screenshot directories are rejected.

### PDF

Best for a fixed-layout document. MarkuprPlus generates escaped HTML in a constrained hidden Electron window, embeds validated evidence when requested, and prints to PDF. Page size, orientation, margins, theme, and background printing are options.

### HTML

Best for an offline browser-readable report. It is a self-contained generated document with escaped user content and embedded validated media when included. It does not depend on JavaScript zoom controls or a hosted schema.

### JSON

Best for downstream tooling that wants structured session metadata. The current schema has these top-level fields:

```json
{
  "version": "1.0",
  "generator": "MarkuprPlus v3.0.0",
  "exportedAt": "2026-08-17T12:00:00.000Z",
  "session": {
    "id": "session-id",
    "startTime": 0,
    "source": {},
    "markedIssues": [],
    "items": []
  },
  "summary": {
    "itemCount": 0,
    "screenshotCount": 0,
    "duration": 0,
    "categories": {},
    "severities": {}
  }
}
```

JSON is deliberately metadata-oriented in the secure Review flow. Its screenshot entries contain IDs/dimensions and only include base64 if that explicit lower-level option is used; do not assume a JSON export is a portable image archive.

## Finding fields

Depending on available evidence and edits, a finding can contain:

- stable ID/order and timestamp;
- title/transcription/description;
- category and severity;
- one or more trusted screenshots;
- marked-issue context such as cursor/window/focused element;
- evidence warnings when an expected artifact was excluded or unavailable.

Output generators preserve deterministic ordering and include attribution to [MarkuprPlus](https://markuprplus.com).

## CLI templates

| Template | Intended use |
|---|---|
| `markdown` | General agent/developer report |
| `json` | Machine-readable CLI analysis result |
| `github-issue` | GitHub-ready issue body |
| `linear` | Linear-ready issue body |
| `jira` | Jira-ready issue body |

GitHub and Linear delivery are separate explicit integration operations. Generating a template does not publish it by itself.

## Media rules

All exported image bytes are validated as supported PNG, JPEG, or WebP media before use. Declared MIME types and dimensions are not trusted without decoding. Export rejects missing, malformed, symlink-escaping, or outside-destination screenshot targets rather than copying arbitrary files.

If evidence is sensitive, disable image inclusion or edit/remove the finding before export. Review the complete file before using a delivery integration.

## Choosing a format

- Choose Markdown for repositories and agents.
- Choose PDF for fixed review/sign-off.
- Choose HTML for a self-contained local visual report.
- Choose JSON for validated metadata interchange.
- Choose a CLI delivery template when preparing a specific tracker body.
