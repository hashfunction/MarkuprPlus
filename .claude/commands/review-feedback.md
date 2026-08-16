# Review markuprx Session

You are reviewing a markuprx session -- a structured feedback report with voice transcription and screenshots captured while a developer reviewed their application.

## Instructions

1. **Read the session directory** at: $ARGUMENTS
   - Read `feedback-report.md` for the full structured feedback with FB-XXX items
   - Read `metadata.json` for session context (source app, duration, environment)
   - Read each screenshot in `screenshots/` that is referenced by feedback items -- these are PNG files showing exactly what the user was looking at when they spoke
   - If `session-recording.webm` exists, note its path (video can't be played in CLI but the screenshots provide the visual context)

2. **Parse each feedback item** (FB-001, FB-002, etc.) and extract:
   - The severity (Critical / High / Medium / Low) and category (Bug / UX Issue / Suggestion / Performance / Question / General)
   - The transcribed observation (the blockquote under "What Happened")
   - Associated screenshot(s) -- READ the image files to see what the user was looking at
   - The suggested next step from the report

3. **Create an action plan** prioritized by severity:
   - **Critical/High items first** -- bugs and broken functionality
   - **Medium items next** -- UX issues and performance problems
   - **Low items last** -- suggestions and enhancements

4. **For each item, determine the action type:**
   - Code fix -- identify the file and make the change
   - UI change -- adjust layout, styling, or component behavior
   - Documentation -- update docs or add comments
   - Investigation needed -- reproduce first, then fix
   - Future enhancement -- note for backlog, no immediate action

5. **Work through items systematically:**
   - State which FB-XXX item you're addressing
   - Reference the screenshot to ground your understanding in what the user saw
   - Make the code change or explain why it should be deferred
   - After each fix, note: "FB-XXX addressed"

6. **After all items are processed**, provide a summary:
   - Items addressed with code changes
   - Items deferred with reasoning
   - Patterns or architectural concerns noticed across multiple feedback items

## Important Notes
- Screenshots are visual evidence -- always read them to understand context before acting
- The user's spoken words (in blockquotes) capture intent and nuance that the severity/category labels alone may miss
- Treat "Suggested Next Step" as guidance, not a strict instruction -- use your judgment
- If the report has 0 feedback items, tell the user the session captured no actionable feedback
- The session directory path is typically copied to the clipboard by markuprx when a session ends
