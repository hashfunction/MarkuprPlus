### MarkuprPlus — visual feedback for AI coding agents

**Repository:** https://github.com/hashfunction/MarkuprPlus

**Website and walkthrough:** https://markuprplus.com

MarkuprPlus records screen and voice, then turns a narrated UI review into structured Markdown with screenshots and timestamps. The desktop workflow lets you mark problems on a live window and saves each mark as a separate finding with its own annotated image.

The local MCP server exposes nine tools for screenshots, screen-and-voice recording, video analysis, and exporting findings to GitHub Issues or Linear. Whisper transcription runs on-device by default; optional cloud providers require configuration.

**Install / run:**

```sh
npx --yes --package markuprplus@3.1.2 markuprplus-mcp
```

**MCP configuration:**

```json
{
  "mcpServers": {
    "markuprplus": {
      "command": "npx",
      "args": ["--yes", "--package", "markuprplus@3.1.2", "markuprplus-mcp"]
    }
  }
}
```

**Documentation:** https://github.com/hashfunction/MarkuprPlus/blob/main/README-MCP.md

**Official registry name:** `io.github.hashfunction/markuprplus` (version 3.1.2, active)

**License:** MIT. Desktop releases are available for macOS and Windows. CLI/MCP prerequisites are documented in the repository.

Disclosure: submitted from the account maintaining MarkuprPlus. This is the `hashfunction/MarkuprPlus` project, derived from Eddie San Juan's original work.
