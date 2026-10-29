# Prompt Builder: manual test examples

How to run: in a Cursor chat opened on `dashboard-ai-engineering`, paste the instruction from the README ("Prompt Builder" section), then one of the inputs below. Compare the answer with the checklist. The results below are **not filled in**: the examples have not been run yet.

The inputs are synthetic. File names in them are intentionally incomplete or missing: the test checks that the builder looks them up in `../dashboard` instead of inventing them.

---

## Example 1. Ordinary Angular task

**Input**

```text
I want to add a "Reset filters" button to the reports filters block.
It should reset all filters to their default values.
There is no design; follow the style of the existing buttons.
```

**Expected behavior**

- Mode: `plan` or `implement`. If the place to change is found unambiguously, `implement` is acceptable. The choice is justified in one sentence.
- The builder searches `../dashboard/frontend/src/app` (for example `features/reports`, `shared/containers/filters`) and marks what it finds as `[verified: path]` or `candidate`. There must be no paths that do not exist in the repository.
- Unknowns: what counts as the "default value", where the filter state lives (form, store), whether URL parameters need resetting if there are any. These are not blocking questions.
- Non-goals: no redesign and no refactoring of the filters.
- Conventions: `AGENTS.md`, `angular-developer` and `angular-developer-extras` SKILL.md. No `any`.
- Validation: `check-types`, `lint` from `frontend/package.json`, plus the spec if one sits next to the code.
- Reporting: an honest report of checks that were not run or failed, no commit/push.
- The prompt itself is self-contained and in English.

---

## Example 2. Bug report with incomplete information

**Input**

```text
Sometimes data disappears from the logs table after changing a filter, please fix it.
```

**Expected behavior**

- Mode: `debug` (the cause is unknown).
- The builder does not propose a fix and does not name a cause.
- Missing context: short and to the point (which page or table, reproduction steps, console/network error, whether it can be reproduced). At most 3 questions. The questions are not blocking: the prompt is delivered as a `DRAFT` or with Unknowns.
- Context separates: Known facts (only the symptom as stated by the user, `[user]`), Assumptions (for example a request race, which is only a hypothesis), Unknowns (steps, environment, frequency).
- `Inspect first`: search for components in `features/logs` (if found, labeled `candidate`/`verified`), filter-change and request handling (`switchMap` and similar, only as "check").
- The agent must: reproduce or explain why it cannot; form 2–4 hypotheses; name the root cause with evidence; edit code only if Scope allows it.
- The prompt forbids masking the symptom (`?.`, empty `catch`).

---

## Example 3. Failed previous agent attempt (`continue`)

**Input**

```text
mode: continue

Original task: migrate the reports filters from combineLatest to toSignal.

Previous agent's response:
"Done. I replaced combineLatest with toSignal in reports-filters and updated the template.
All tests pass."

After that I see:
- `npm run check-types` fails: "Type 'Signal<Filters | undefined>' is not assignable to type 'Filters'" in reports-filters.component.ts
- in the browser the filters are not applied when the page is first opened

I do not want to lose my uncommitted changes in a neighboring file.
```

**Expected behavior**

- Mode: `continue` (given).
- Context contains all five blocks: `Completed by the previous agent`, `Incomplete`, `Failed, with evidence`, `Next step`, `Do not repeat`.
- The claims "Done" and "All tests pass" are marked `[prev-agent, unverified]`. The builder does not accept them as fact and does not repeat "tests pass".
- Failed: the exact `check-types` error text is quoted verbatim, and the first-open symptom is listed separately. The hypothesis "`toSignal` without `initialValue` yields `undefined`" is only an `Assumption`, not a diagnosis.
- `Inspect first`: `git status`, `git diff`, reading `reports-filters.component.ts` (path verified or `unverified`), reconciling the previous agent's claims with the code.
- Do not repeat / Scope: do not revert or rewrite the whole work, do not touch the user's uncommitted changes, do not commit/push.
- Next step is one concrete action (reproduce the type error and fix its cause), then `check-types`, `lint`.
- No claims that checks passed.

---

## General checklist for every run

- [ ] The answer follows the 4-part format (mode, missing context if needed, prompt in a block, ≤ 3 "why" bullets).
- [ ] The prompt is self-contained: no "above", no "as we discussed".
- [ ] All paths are verified or marked `unverified` / `candidate`.
- [ ] Facts, assumptions and unknowns are separated.
- [ ] Non-goals, acceptance criteria and concrete validation are present.
- [ ] There is a requirement to honestly report checks that were not run or failed.
- [ ] No invented commands (only those from `frontend/package.json`).
- [ ] The builder did not modify any files itself.

## Run log (fill in manually)

| Date | Example | Mode in the answer | Checklist passed | Notes |
|---|---|---|---|---|
| | 1 | | | |
| | 2 | | | |
| | 3 | | | |
