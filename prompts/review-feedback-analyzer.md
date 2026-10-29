# Local review feedback analysis

Use this prompt only after the feedback is already stored locally (manual paste or import). Do not go to Bitbucket and do not call external models. Do not edit `../dashboard/.agents/skills/self-review/SKILL.md` or other skills until the user explicitly confirms a specific change.

## Sources

- Raw data: `inbox/review-feedback/PR-*/feedback.md`, `context.md` (and `comments.json`, `metadata.json` if the import went through the API)
- Normalized findings log: `data/review-log.jsonl`
- Self-review: `../dashboard/.agents/skills/self-review/SKILL.md` and the references it relies on (skill paths are relative to the application repository `../dashboard`)

`comments.json` and `feedback.md` are the original history. `review-log.jsonl` holds findings only. Do not copy full comment texts into it.

## How to analyze

1. Read `metadata.json` and select comments with `authorRole: tech_lead`. If there are none, stop and say the tech lead identifier is not mapped. Do not assign the tech lead by display name.
2. Treat replies from the PR author and other participants as thread context (`parentId`), not as separate defects.
3. For each substantive tech lead comment, pick one kind: `question`, `suggestion`, `discussion`, `likely_issue`, `unknown`. Do not record a question or discussion as a defect.
4. Group only recurring `likely_issue` items and stable `suggestion` items. Do not turn a single disputed comment into a skill rule.
5. Compare each group with the self-review skill. If a rule already exists, propose a reference to it instead of a new item. If there is no rule, propose a short wording and the file where it could be added.
6. Show the proposal to the user. After confirmation you may append one JSONL line per group:

```json
{"analyzedAt":"","pullRequestIds":[],"sourceCommentIds":[],"kind":"likely_issue","summary":"","suggestedSkillChange":"","skillPath":"","status":"proposed"}
```

Keep `status` as `proposed` until the user accepts the skill change. After acceptance it may be changed to `accepted`. Do not change the skill itself before confirmation.
