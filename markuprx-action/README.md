# markuprx GitHub Action

[![GitHub Action](https://img.shields.io/badge/GitHub%20Action-markuprx--action-orange?style=flat-square&logo=github)](https://github.com/marketplace/actions/markuprx-analyze)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](../LICENSE)

Analyze screen recordings in CI/CD and post structured visual feedback reports directly on pull requests.

## What it does

1. Runs `markuprx analyze` on your video recording(s)
2. Posts the structured feedback report as a PR comment
3. Optionally creates GitHub Issues for each feedback item
4. Uploads the full report as a GitHub Actions artifact

## Usage

### Basic — analyze a recording and comment on PR

```yaml
name: Visual Feedback

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  feedback:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: eddiesanjuan/markuprx-action@v1
        with:
          video-path: ./recordings/session.mp4
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Process a directory of recordings

```yaml
- uses: eddiesanjuan/markuprx-action@v1
  with:
    video-path: ./recordings/
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Create GitHub Issues from feedback

```yaml
- uses: eddiesanjuan/markuprx-action@v1
  with:
    video-path: ./recordings/session.mp4
    github-token: ${{ secrets.GITHUB_TOKEN }}
    create-issues: 'true'
```

### Use a different output template

```yaml
- uses: eddiesanjuan/markuprx-action@v1
  with:
    video-path: ./recordings/session.mp4
    github-token: ${{ secrets.GITHUB_TOKEN }}
    template: github-issue
```

### Skip PR comment, just upload artifact

```yaml
- uses: eddiesanjuan/markuprx-action@v1
  with:
    video-path: ./recordings/session.mp4
    github-token: ${{ secrets.GITHUB_TOKEN }}
    comment-on-pr: 'false'
```

### Create issues in a different repo

```yaml
- uses: eddiesanjuan/markuprx-action@v1
  with:
    video-path: ./recordings/session.mp4
    github-token: ${{ secrets.GITHUB_TOKEN }}
    create-issues: 'true'
    repo: myorg/other-repo
```

### Use the report path in subsequent steps

```yaml
- uses: eddiesanjuan/markuprx-action@v1
  id: markuprx
  with:
    video-path: ./recordings/session.mp4
    github-token: ${{ secrets.GITHUB_TOKEN }}

- name: Do something with the report
  run: cat "${{ steps.markuprx.outputs.report-path }}"
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `video-path` | Yes | — | Path to video file or directory of recordings |
| `github-token` | Yes | `${{ github.token }}` | GitHub token for PR comments and issue creation |
| `template` | No | `markdown` | Output template (`markdown`, `json`, `github-issue`, `linear`, `jira`) |
| `create-issues` | No | `false` | Create GitHub Issues from each feedback item |
| `comment-on-pr` | No | `true` | Post the report as a PR comment |
| `repo` | No | Current repo | Target repo for issues (`owner/repo` format) |

## Outputs

| Output | Description |
|--------|-------------|
| `report-path` | Path to the generated markdown report |
| `issues-created` | Number of GitHub issues created (0 if disabled) |

## Requirements

- **ffmpeg** — installed automatically on Ubuntu/macOS runners if missing
- **Node.js 20+** — set up automatically by the action

## How it works

```
Video recording(s)
       |
       v
  markuprx analyze
  (transcribe → detect key moments → extract frames → generate report)
       |
       v
  ┌─────────────────────────┐
  │  PR Comment (optional)  │  ← structured feedback with screenshots
  │  GitHub Issues (opt.)   │  ← one issue per feedback item
  │  Artifact upload        │  ← full report preserved
  └─────────────────────────┘
```

## Supported video formats

`.mp4`, `.mov`, `.webm`, `.mkv`, `.avi`

## Tips

- **Recording in CI**: Use tools like `xvfb` + `ffmpeg` to record E2E test runs, then pipe them through markuprx
- **Manual recordings**: Drop screen recordings into a `recordings/` directory and commit them (or use Git LFS)
- **PR updates**: The action updates an existing markuprx comment instead of creating duplicates on re-runs

## Example Workflows

Ready-to-use workflow files in [`examples/github-action-examples/`](../examples/github-action-examples/):

| Workflow | Description |
|----------|-------------|
| [`basic-pr-feedback.yml`](../examples/github-action-examples/basic-pr-feedback.yml) | Analyze recordings in `./recordings/` and comment on PRs |
| [`visual-regression.yml`](../examples/github-action-examples/visual-regression.yml) | Record E2E test runs with xvfb + ffmpeg, then analyze for visual regressions |
| [`qa-pipeline.yml`](../examples/github-action-examples/qa-pipeline.yml) | On `needs-qa` label, download attached recordings and create sub-issues |

## License

MIT
