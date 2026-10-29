# AI engineering workspace

Local workspace for analyzing code review and improving skills and prompts. It lives **outside** the application repository and does not end up in its git.

- Application: `../dashboard` (GitHub `lavinmedia/dashboard`)
- Review source: Bitbucket Cloud `lavinmedia/dashboard-moved`. The PRs being analyzed come from there, not from the application repository.
- Self-review skill: [`../dashboard/.agents/skills/self-review/SKILL.md`](../dashboard/.agents/skills/self-review/SKILL.md). It is not changed from this workspace without explicit confirmation.

## Open it separately in Cursor

```bash
cursor /Users/aleksandrmojseenko/Documents/Capslock/Corporate/dashboard-ai-engineering
```

Or use **File → Open Folder** and select this folder. It is not added to the regular application window.

To see both folders in one window (for example, when checking against the skill), open `dashboard-ai-engineering.code-workspace` from this folder. It is a separate window and does not change the application workspace.

## Structure

```text
.
├── README.md
├── .env                      # secrets, local only (never committed)
├── .env.example
├── .gitignore                # keeps raw review data and secrets local
├── config/                   # review-feedback.example.json (+ local .local.json, not committed)
├── inbox/review-feedback/    # raw review data: PR-*/feedback.md, context.md (local)
├── data/                     # review-log.jsonl: normalized findings, not raw comments
├── references/               # analysis reports (review-feedback-analysis-report.md)
├── reports/                  # improvement decisions (self-review-improvement-decisions.md)
├── prompts/                  # review-feedback-analyzer.md, prompt-builder.md, prompt-builder.examples.md
└── scripts/                  # Bitbucket importer and tests
```

The `skillPath` field in `data/review-log.jsonl` is relative to the application repository root (`../dashboard`).

## Where things are stored

- **Raw PR feedback:** `inbox/review-feedback/PR-<NN>/feedback.md` (paste from the Bitbucket page) and `context.md` (the task). Folders `PR-01`…`PR-10` correspond to PRs 829, 830, 816, 812, 805, 769, 776, 747, 748, 656 in `dashboard-moved`.
- **Reports and decisions:** `references/` and `reports/`.
- **Analysis findings:** `data/review-log.jsonl`, one line per finding.

## Privacy

Raw review comments, `.env` and the local config are not committed and are not sent to chats unless necessary. Do not commit, publish or forward `inbox/` and `.env`. Never send the token to a chat.

## How to run the analysis

In a Cursor chat opened on this folder:

```text
Analyze the review feedback in inbox/review-feedback/PR-01 … PR-10 following prompts/review-feedback-analyzer.md.
Compare the tech lead's recurring comments with ../dashboard/.agents/skills/self-review/SKILL.md.
Propose changes to skills and prompts, but do not apply them until I confirm.
```

The analysis uses `feedback.md` and `context.md`. `comments.json` and `metadata.json` are needed only for an API import.

## Prompt Builder

Turns an incomplete request and its context into a prompt for the next coding-agent run. It changes nothing itself: it is read-only and uses `../dashboard` only to verify paths. Modes: `research`, `plan`, `implement`, `debug`, `review`, `continue`. If no mode is given, the builder recommends one.

In a Cursor chat opened on this folder:

```text
Build a prompt following prompts/prompt-builder.md.
mode: <research|plan|implement|debug|review|continue>   # optional

<task, context, errors/logs/diff, previous agent response, constraints>
```

The answer contains the recommended mode with a reason, missing context (if it matters), the ready-to-copy prompt in one block, and at most three "why it matters" bullets. Copy the prompt into a new chat opened on `../dashboard`.

Manual tests on three examples: [`prompts/prompt-builder.examples.md`](prompts/prompt-builder.examples.md).

## Bitbucket importer (deferred)

The API import is ready but not used right now: the corporate token lacks the `read:pullrequest:bitbucket` permission. The main source is manual paste.

If the permission becomes available, from the root of this folder:

```bash
cp .env.example .env
cp config/review-feedback.example.json config/review-feedback.local.json
node scripts/import-review-feedback.mjs --whoami
node scripts/import-review-feedback.mjs --limit 10
node scripts/import-review-feedback.mjs --pr <number or URL>
node scripts/import-review-feedback.mjs --refresh
node scripts/import-review-feedback.mjs --list   # no network
```

`.env` holds `BITBUCKET_API_TOKEN` and, if needed, the author and tech lead identifiers (account id or UUID). `config/review-feedback.example.json` points to `lavinmedia/dashboard-moved`. The repository cannot be detected automatically because this folder has no `bitbucket` git remote.

Tests (no network):

```bash
node --test scripts/import-review-feedback.test.mjs
```
