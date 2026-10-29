# Self-review: decisions on proposed improvements

**Date:** 2026-10-22
**Status:** SR-01, 02, 03, 04, 06, 09 were applied on 2026-10-22 to `.agents/skills/self-review/SKILL.md` (on the owner's confirmation). Not committed; fixtures and before/after runs were not executed (§7).
**Everything else:** REJECT/DEFER unchanged; SR-05 stays REJECT.

Sources:

- Historical: 10 PRs from Bitbucket `lavinmedia/dashboard-moved`, pasted manually into `inbox/review-feedback/PR-01…PR-10`.
- Current code: GitHub `lavinmedia/dashboard` (`../dashboard`, read-only).

These are different repositories. Line numbers and paths from the historical PRs do not apply to the current code.

**Status of the source PRs (per the owner, 2026-10-22):** all comments in all 10 PRs are closed and the changes have long been in production. So the tech lead's comments were either addressed or withdrawn during review. This does not change the decision statuses below, but it removes the uncertainty "did the author accept the change" (see §3.2).

---

## 1. Executive summary

- **14 proposals** were assessed: **6 ACCEPT, 5 REJECT, 3 DEFER**.
  - 10 from `data/review-log.jsonl`.
  - 4 from the §2.11 rows in `references/review-feedback-analysis-report.md`.
- The earlier analysis attributed PRs by keywords, and that attribution is **often wrong**. Checking against the comment texts confirmed far from all PRs listed in the log (see §3.3). Example: for SR-07 (CVA) 1 PR of 4 is confirmed, for SR-04 (HTTP flags) 1 of 3.
- Most topics are **already covered by the skill text**: `?.`/`??`, `effect` + `.set`, `takeUntilDestroyed`, dead code, controlled `@Input`. The tech lead himself quoted `effects.md` in two PRs. So the failure is in **reliability of application**, not in a missing rule. These need targeted clarifications and a procedural detection step, not new items.
- The skill contains **text that itself produces false findings**: "async callbacks / state updates — use `markForCheck()`" (SKILL.md, Change detection section). It contradicts the tech lead's comments about unnecessary `markForCheck` after signals. This is the most valuable fix.
- All proposals are wording changes to existing items. No new sections are needed. Deterministic automation is realistic for only one item (SR-12), and a measurement is needed first.

**Top 3:**

1. **SR-03**: rewrite the Change detection section as a decision rule.
2. **SR-02**: clarify `effect`/`linkedSignal` and the "signal + emit the same thing" case.
3. **SR-01**: add a mechanical pass over added `?.`/`??` in Step 3.

---

## 2. Workspace migration summary

| What | State |
|---|---|
| New workspace | `/Users/aleksandrmojseenko/Documents/Capslock/Corporate/dashboard-ai-engineering/` (at the time of migration not a git repository; it now has its own git repository, separate from the application's) |
| Opening | `dashboard-ai-engineering.code-workspace`: folder `.` + `../dashboard` as a read-only reference |
| Moved | `scripts/` (importer + tests), `prompts/`, `references/`, `data/`, `config/`, `inbox/review-feedback/`, `.env`, `.env.example`, `README.md` |
| Secrets | `.env` was copied byte for byte; its contents were not read or printed |
| Paths | `workspaceRoot` in the importer and paths in prompt/report/README were rewritten to the new root. The importer was not deleted |
| Workspace `.gitignore` | New, local: `.env`, `config/review-feedback.local.json`, `inbox/review-feedback/*/`, `data/*.jsonl`, etc. |
| Application repository | `ai-engineering/` was removed from the working copy. HEAD `df9977e51`, branch `master`, `git status` clean |
| Remotes | Unchanged: `origin` = GitHub `lavinmedia/dashboard`, `bitbucket` = `lavinmedia/dashboard` |

**Caveat about the application `.gitignore`.** At the start of the session it had an uncommitted change (` M .gitignore`) and `ai-engineering/` files staged in the index. By the user's explicit choice (`revert_all`) `.gitignore` was restored to HEAD and `ai-engineering/` was removed. The final state = HEAD, **not** the original working state. History, remotes and branches were not changed. The original `.gitignore` change is not saved anywhere.

---

## 3. Evidence audit

### 3.1 Artifacts

| Artifact | Role |
|---|---|
| `inbox/review-feedback/PR-01…10/feedback.md`, `context.md` | Primary data (Bitbucket UI paste) |
| `data/review-log.jsonl` | 10 `proposed` records, field `analyzedAt` |
| `references/review-feedback-analysis-report.md` | Earlier analysis (themes 2.1–2.11) |
| `.agents/skills/self-review/SKILL.md` + `angular-developer{,-extras}` | Current coverage |
| `frontend/eslint.config.js`, `tsconfig`, `app.config.ts`, `package.json` | Automation and CD context |

### 3.2 Method and limits

- I parsed the tech lead's comment blocks, deduplicated within each PR and searched for wordings with narrow queries. Then I read the found texts in full.
- **"Confirmed"** below = I found and read the comment text. This is a lower bound: the paste mixes comments and diff fragments, and the parser does not separate them reliably.
- Known (per the owner): all threads are closed, the code is in production. This is not visible from the paste (there is no resolved status in it).
- Unknown: the outcome of each thread (fixed, refuted or accepted as is), timestamps, which commit is commented on. The author's replies are visible only in fragments. "Closed" does not mean "the tech lead was right": closing may have followed the author's reply.
- The tech lead's questions ("are you sure…?") are requests for verification, not proven defects. They were classified that way. Closing a thread does not turn them into confirmed defects.
- Consequence for the decisions: comments about `markForCheck`, `effect`, `?.`/`??` can be considered practice the team actually applied in these PRs. But this adds no confirmed recurrence, so the count of confirmed PRs in §3.3 and the statuses were not changed.

### 3.3 Cross-check of PRs from `review-log.jsonl` against the texts

| ID | PRs in the log | Confirmed in the text | Comment |
|---|---|---|---|
| SR-01 | 10 PRs | 829, 830, 747, 748, 656 | 4 reliably (830, 747, 748, 656); 829 only as a code hunk. "~26 comments" is not reproducible |
| SR-02 | 816, 769, 776 | 816, 769, 776 | Confirmed. PR-10 uses NgRx ComponentStore `this.effect()`, not Angular `effect()` |
| SR-03 | 812, 805, 747 | 812, 805 (+656 as a counterexample) | 747 not found |
| SR-04 | 805, 776, 656 | 805 | In 776 the word "flag" matched in a JSDoc, in 656 there is no flag reset |
| SR-05 | 805, 776, 656 | 805 | This is about the `Destroyable` base class, not a forgotten unsubscribe |
| SR-06 | 829, 748 | 829 (+776, 656 other kinds) | 748 not confirmed |
| SR-07 | 829, 769, 776, 748 | 829 | 769/776 are about `effect`, 748 about a controlled input |
| SR-08 | 816, 812, 769, 656 | 816, 812, 769, 656 | Two of the four are already covered by other skill items |
| SR-09 | 829, 830, 805, 769, 776, 656 | 829, 830 (+776 indirectly) | 805/769/656 not found |
| SR-10 | 812, 769, 776, 747, 748, 656 | 812 | The other matches are noise |
| SR-11 | 829, 830 | 829, 830 | Confirmed |
| SR-12 | 769, 748 | 776 | The confirmed PR differs from the listed ones |
| SR-13 | 769, 747, 656 | 769 | Rules Engine domain |
| SR-14 | several | 776, 656 | The tech lead himself calls part of it a "preference" |

### 3.4 Discrepancies

1. **"~231 comments"** in the report is not reproducible: recounting gives 351 blocks, 210 unique, 201 substantive. The "clean prose" heuristic leaves only 57 blocks. Treat the number as an estimate, not a metric.
2. `analyzedAt: 2026-03-26` in the log and report (dated before 2026-10-22). The correct analysis date is unknown. Not corrected (data was not changed).
3. **The type** `likely_issue` was assigned by the earlier analysis. Many of these are questions or "if you want" from the tech lead. It is now known that all threads are closed, but not how.
4. **PR-10** `effect` is ComponentStore, not Angular. So its comments about mutable state concern RxJS patterns, not SR-02.
5. **Leftover folder** `inbox/review-feedback/PR-paste/` (an empty placeholder).
6. **The proposals have no stable IDs.** SR-01…SR-14 were introduced here (order as in `review-log.jsonl`, then the §2.11 rows).
7. **Contradiction between SR-01 and SR-09.** SR-01 says "trust types, remove `?.`"; SR-09 says "the type may not match runtime". Resolution: at the boundary (API/WS) types must be verified, inside the code they are trusted. The wordings below separate the two.

### 3.5 Decision criteria

- **ACCEPT**: there is a confirmed gap OR the skill text produces wrong findings, and the change is narrow with a low risk of false positives.
- **REJECT**: already covered, or a single stylistic case, or domain-specific, or the rule would do harm.
- **DEFER**: weak confirmation, or a measurement/team decision is needed before applying.

---

## 4. Decision table

| ID | Proposal | Status | Confidence | Target | Priority |
|---|---|---|---|---|---|
| SR-01 | Excess `?.`/`??`: mechanical pass over the diff | **ACCEPT** | Medium–high | Self-review, Step 3 + existing Defensive hygiene block | P3 |
| SR-02 | `effect`+`.set` → `computed`/`linkedSignal`; signal + emit | **ACCEPT** | High | Self-review, edit 2 existing items | P2 |
| SR-03 | `markForCheck`/`detectChanges` next to signals | **ACCEPT** | Medium–high | Self-review, rewrite the Change detection section | **P1** |
| SR-04 | HTTP flag not reset on error | **ACCEPT** | Low–medium | Self-review, extend the `resource()` item | P5 |
| SR-05 | `takeUntilDestroyed` instead of manual unsubscribe | **REJECT** | High | No change (see D-3) | n/a |
| SR-06 | Dead branches: examples | **ACCEPT** | Medium | Self-review, extend an existing bullet | P4 |
| SR-07 | CVA: no-op `onChange`/`onTouch` | **REJECT** | Medium | No change | n/a |
| SR-08 | Extract complex conditions into private methods | **DEFER** | Medium | Self-review (LOW), later | n/a |
| SR-09 | DTO/API: verify the contract when changing types | **ACCEPT** | Low–medium | Self-review, Type safety | P6 |
| SR-10 | Role matrix for `@if` | **DEFER** | Medium | Repository conventions, if more data appears | n/a |
| SR-11 | `no-explicit-any`: type at the declaration | **REJECT** | High | No change | n/a |
| SR-12 | `@HostListener` → `host` metadata | **DEFER** | Medium | Automation (lint) after measuring | n/a |
| SR-13 | contenteditable / Rules Engine | **REJECT** | Medium | No change (optional local note) | n/a |
| SR-14 | Naming / typos | **REJECT** | High | No change | n/a |

Total: **ACCEPT 6 / REJECT 5 / DEFER 3**.

Duplicate groups:

- **A. Types vs runtime:** SR-01, SR-06, SR-09. Different directions, joined by the boundary rule (§3.4, item 7).
- **B. Leftovers after the signals migration:** SR-02, SR-03. One wave of changes, two different mechanisms.
- **C. Readability:** SR-08, SR-14.
- **D. Already covered:** SR-05, SR-11, partly SR-06.

---

## 5. Detailed rationale

### SR-01: excess `?.` / `??` · ACCEPT (medium–high)

**Evidence (confirmed).**

- 830: "you don't need optional chaining since you asserted the client before".
- 747: "all those safety checks everywhere… should only be at the source… `getRawValue()`". Plus "remove `?? new RuleActionsValue()` if we make the control `nonNullable: true`".
- 748: "I removed the `| null`… avoid redundant defensive mechanisms".
- 656: "defensive logic implies the store is not initialized correctly… defaults should happen at the source, inside the selectors".

**Coverage.** Fully described in the "Defensive coding hygiene" block (origin-only, `getRawValue()`, the question "can this realistically be null?"). The tech lead's comments restate the existing rule. **There is no gap in the wording, the gap is in detection.**

**Benefit.** Closes the most frequent class of comments; gives a mechanical procedure instead of "go by feel".

**Risks.** False positives: `?.` at the boundary (API/WS), optional `viewChild()`, DOM APIs, `form.value` (Partial). `noUncheckedIndexedAccess` is **off**, so `arr[0]?.x` can be appropriate for a "not undefined" type. Do not ban `?.`/`??` categorically.

**Target.** Self-review (Step 3 + the existing block). No new item needed.

**Wording (draft).**

> Before judging logic, list every added `?.` / `??` guard in the file diff (`git diff $DIFF_SCOPE -- <file>` filtered to added lines). For each, name what guarantees non-null at that point: declared type, `nonNullable` control, earlier assertion, or a default set at the origin (selector, factory, constructor). If such a guarantee exists and the value does not come from an external boundary (API/WebSocket payload, DOM, optional `viewChild()`), flag it and point to the origin where the default belongs. Do not flag guards on genuinely optional types or on boundary data.

### SR-02: `effect` for derived state; double update · ACCEPT (high)

**Evidence.**

- 769: `effect` calls `valueState.set(...)`; the tech lead quotes `effects.md` and suggests `linkedSignal`.
- 776: `searchValue`, `pickerPosition` → `linkedSignal`, tech lead: "this is an antipattern, and we have a skill".
- 816: "double signal update": a local `tokens.set(...)`, then emitting the same tokens, which the parent returns through an input.

**Coverage.** Present: "`computed()` used for derivations, not `effect()` with `.set()`" and the controlled `@Input`/`@Output` rule. `effects.md` is loaded on the `effect(` trigger. The rule existed and did not fire.

**Gap.** There is no mention of `linkedSignal` for writable derived state and no explicit "signal + emit of the same value" case.

**Risks.** `effect` is legitimate for non-signal side effects; the tech lead himself kept a narrow `effect` for DOM synchronization. A categorical ban is unacceptable. NgRx ComponentStore `this.effect()` is something else.

**Target.** Existing self-review items (merge, do not add).

**Wording.**

> For each added `effect()` whose body calls `.set()`/`.update()` on a signal, classify it: derived from other signals → `computed()`; writable state that resets when a source changes → `linkedSignal()`; side effect on a non-signal target (DOM, logging, third-party API) → keep the `effect()`, narrowed to that side effect. Do not treat NgRx ComponentStore `this.effect()` as an Angular `effect()`.
>
> Do not both `.set()` a local signal and emit the same value when the parent pushes it back through an input; choose one source of truth (`model()`, `linkedSignal` over the input, or emit only).

### SR-03: unnecessary `markForCheck` / `detectChanges` · ACCEPT (medium–high)

**Evidence.**

- 805: "we can remove the mark for check here, since we now use signal, please test. I think the setting of a value is already marking for a check" (next to `pixelsLoading.set(false); cd.markForCheck()`).
- 812: the tech lead replaces the "vm + async + markForCheck" approach with `toSignal(control.valueChanges…)`.
- 656 (counterexample): `toggleOptions()`: "should work fine with OnPush, both are event handlers so Angular should trigger change detection".

**Code context.** Angular 21.2.6, zone-based (`provideZoneChangeDetection()`), 188 of 206 components OnPush. `markForCheck` in 28 files, `detectChanges()` in 74.

**Coverage and conflict.** The Change detection section says: "In all other cases — state updates, `writeValue`, `@Input` setters, async callbacks — use `cd.markForCheck()`". This **pushes toward adding** `markForCheck` **after writing to a signal**, the opposite of the tech lead's comments.

**What is true.** A signal read in the template marks the view dirty by itself. So does an event handler from the template of the same component. But mutating a non-signal field from `subscribe`, a timer, `writeValue` or an input setter in OnPush **does require** `markForCheck`. So it cannot be advised to remove it everywhere. The "please test" itself indicates the tech lead is not 100% sure. The thread is closed, but the result of that test is not visible in the paste.

**Risks.** A false "unnecessary" if the state is not a signal or changes from an external source (including a service read by another view).

**Target.** Rewrite the Change detection section (priority 1).

**Wording.**

> For every `ChangeDetectorRef` call, look at the state change next to it: (1) signal read by the template → no call needed; (2) plain-field mutation inside a template or host event handler of the same component → no call needed; (3) non-signal state mutated from a non-template origin (subscribe callback, timer, `writeValue`, input setter, external event) → `markForCheck()`, or move the state to a signal / `toSignal()`; (4) `detectChanges()` only when the next lines read the updated DOM. Flag a call only for cases (1)–(2), and suggest verifying by test.

### SR-04: HTTP flag not reset on error · ACCEPT (low–medium)

**Evidence.** Only 805: "If the HTTP fails, the flag stays true which means it will never be retried". Suggested `catchError` or `resource()` + `reload()`.

**Coverage.** Partial: the `resource()` item and "`catchError` inside `switchMap`". Resetting the flag on all paths is not described.

**Path analysis.** A flag set before the request must be reset or made retryable on **success**, **error** and **completion/cancellation** (`finalize`). A latch reset only on success blocks retry. For the request itself `resource()` is enough.

**Risks.** False positives if the "flag" is intentionally one-shot. One confirmation, so confidence is low. Accept only as an extension of an existing item.

**Target.** Self-review: extend the `resource()` item.

**Wording.**

> A flag set before an HTTP call (`requested`, `loaded`, `inFlight`, `isLoading`) must be reset or made retryable on success, on error (`catchError`/error handler) and on completion or cancellation (`finalize`). A latch cleared only on success blocks retry. Prefer `resource()` with `reload()` when the flag mirrors request status.

### SR-05: `takeUntilDestroyed` · REJECT (high)

**Evidence.** Only 805: "stop using `Destroyable`, use `DestroyRef`".

**Coverage.** The item "Subscriptions cleaned up with `takeUntilDestroyed()`" already exists. The proposed "grep reminder" is a repeat.

**Observation outside the proposal.** 22 files inherit `Destroyable`, `takeUntilDestroyed` is in 4 files. This is a migration and repository-convention question (D-3), not a skill wording question.

### SR-06: dead branches · ACCEPT (medium)

**Evidence.**

- 829: `useCustomBudgets` of type `0 | 1` is never a `boolean`.
- 776: a `catchError` that only rethrows the error.
- 656: `getAll` became dead after a refactor (not confirmed in 748).

**Coverage.** There is a general bullet "Conditions that can never be true…", plus "redundant wrapper methods". Not covered: a no-op `catchError` and a method without callers after a refactor.

**Target.** Extend the existing bullet with three examples. Automation (`no-unnecessary-condition`, searching for unused exports) is not justified, see §8.

**Wording.**

> Examples: comparing a value to a type outside its declared union (`0 | 1` vs `boolean`); a `catchError` that only rethrows; a method left without callers after a refactor (search for the symbol before reporting).

### SR-07: CVA: no-op `onChange`/`onTouch` · REJECT (medium)

**Evidence.** Only 829, worded "if you want to ease up…".

**Public contract analysis.** `registerOnChange/OnTouched` are called by forms after creation; a default no-op is safe, as is `onChange?.(…)`. There is no defect, it is style. A default no-op can hide that the callback was not registered.

**Repository.** 20 CVA files, 9 with `?.()`, 0 with a default no-op (by my search pattern). The rule would go against current practice.

### SR-08: extract complex conditions · DEFER (medium)

**Evidence.** 816 ("2–3 re-reads"), 656 (double negation in a filter comparison), 812 (precompute in `vm`), 769 (regex). The last two are already covered by the items on template getters and named regexes.

**Decision.** The remainder (conditions in `.ts`) is subjective and hard to verify mechanically, and risks producing noise in a "facts only" report. Return after SR-01…03; when applying, LOW only and with a threshold (≥3 operands or nested negation).

### SR-09: DTO/API contract · ACCEPT (low–medium)

**Evidence.**

- 829: changing the case of union values. Tech lead: "Are you sure API both returns and expects lowercase?… fails in production". Then an update: "Confirmed with Alexandra, those are uppercase". The outcome cannot be reconstructed unambiguously from the paste; the change was probably wrong. The thread is closed and the code is in production, so the discrepancy was either fixed or refuted; which one is unknown.
- 830: "Are you sure those are numbers? … parseInt", "Did the BE API payload change?" No answer.

Both come from the `no-explicit-any` campaign; the type changes silently altered semantics.

**Classification.** **There are no confirmed violations.** There is one probable (829) and unanswered questions (830). This is "check the contract", not style.

**Coverage.** There are items on DTOs/mappers and "verify claims outside the diff". There is no explicit trigger for changes to literals, unions and constructor validation.

**Risks.** The agent does not know the BE: it can only look for evidence in the repository and must write "needs verification". The `no-explicit-any` campaign is temporary, so recurrence will decrease.

**Target.** Self-review, Type safety.

**Wording.**

> When the diff changes a literal union, enum, numeric/string/boolean field type, constructor validation, or a `serialize`/mapper for an API or WebSocket payload, look for evidence of the runtime shape (API model usage, mocks/fixtures, existing `parseInt`/casts). Report it as "needs verification" with the evidence checked; report a defect only if the repository contradicts the new type.

### SR-10: role matrix for `@if` · DEFER (medium)

**Evidence.** Only 812: "Shouldn't admin, leadPriceEditor, leadPriceToggler be also able to viewLeadPrice?" A real logic bug, but it requires domain knowledge (which permissions imply others).

**Analysis.** Without a source of truth about roles a general step turns into guessing. There is no a11y data at all (not a single comment), so no a11y rule is proposed.

**Decision.** Return if more cases appear. Possible place: repository conventions with a map of implied permissions.

### SR-11: `no-explicit-any` · REJECT (high)

The rule is in the skill ("No `any`") and in the typescript-eslint recommended preset (`eslint.config.js` includes it). I did not run lint to confirm this.

### SR-12: `@HostListener` → `host` · DEFER (medium)

**Evidence.** 776. This is the only confirmed PR.

**Data.** 7 files with `@HostListener`, 43 with `host: {`. The installed `angular-eslint` 21.3.1 contains the rule `prefer-host-metadata-property`, but it is only in the `all` config, not in `recommended`, and is not enabled in the project. `angular-developer/references/components.md` says nothing about `host`.

**Decision.** Automation is better than skill text. First measure the number of violations (§7), then decide. Not enabled and not verified.

### SR-13: contenteditable / Rules Engine · REJECT (medium)

One PR (769), domain-specific. A general skill does not need it.

### SR-14: naming / typos · REJECT (high)

LOW, the tech lead calls part of it a "preference". Linters and human review.

---

## 6. Recommended implementation sequence

Each step as a separate small change. Do not start without confirmation.

1. **SR-03**: rewrite Change detection (fixes the text that produces false findings).
2. **SR-02**: clarify two existing items.
3. **SR-01**: detection step in Step 3 + edit the Defensive hygiene block.
4. **SR-06**: three examples in the existing bullet.
5. **SR-04**: extend the `resource()` item.
6. **SR-09**: trigger in Type safety.

Then separately: the SR-12 measurement and decisions on §8.

---

## 7. Validation plan

None of this has been executed yet, except item 5.

1. **Before the change:** collect a small set of fixture diffs (positive and negative controls for each item), for example `?.` at an API boundary and `markForCheck` from `subscribe`. Historical PRs from Bitbucket are not available as diffs, so the fixtures are synthetic or from the current branch.
2. **Run** self-review on the fixtures before and after the wording change; compare the findings. Criterion: no new false positives on negative controls and the positive ones are found.
3. **SR-03:** check separately on the example from 805 and on a counterexample (a non-signal field from `subscribe`) to make sure the rule does not advise removing a needed `markForCheck`.
4. **SR-12:** run `prefer-host-metadata-property` in a temporary config and count violations (grep expectation: about 7 files, not verified). Do not change the project config.
5. **Importer:** its tests were re-run on 2026-10-27 after the English translation of its messages: `node --test scripts/import-review-feedback.test.mjs`, 15 passed, 0 failed.
6. Check that the changed skill still follows its own non-negotiables (file order, fences with real numbers, "facts only" report).

---

## 8. Deferred items

| ID | Topic | Why deferred |
|---|---|---|
| SR-08 | Extract complex conditions | Subjective, noise |
| SR-10 | Role matrix | One case, a domain map is needed |
| SR-12 | `host` metadata | Needs measuring, lint is better |
| D-1 | `@typescript-eslint/no-unnecessary-condition` | Needs type-aware rules (`parserOptions.project`), not enabled now; violations not measured, `noUncheckedIndexedAccess` is off |
| D-2 | `explicit-member-accessibility` and a custom rule on `templateUrl` (line in 776, the tech lead asked for a ticket) | A custom rule is expensive to maintain; not proposed earlier, so outside the count |
| D-3 | Migrating `Destroyable` (22 files) → `DestroyRef` | Team convention, not the skill |
| D-4 | Audit of 74 `detectChanges()` calls | Outside the review data |
| D-5 | Fix `2026-03-26` and "~231" in the report and log | Data was not changed by condition |
| D-6 | Remove the empty `PR-paste/` folder | Not touched without instruction |

---

## 9. Explicit non-changes

- Skills other than the self-review changes listed in the status line at the top.
- Application code, application `.gitignore` (except the rollback to HEAD, see §2), history, branches and remotes of both repositories.
- The importer logic was not changed. Its user-facing messages were translated to English on 2026-10-27. Bitbucket was not opened and no authentication was performed.
- ESLint and `tsconfig` configuration.
- Nothing was committed or pushed by me.
- Statuses in `data/review-log.jsonl` stay `proposed`, not updated.
- Not introduced: a ban on `?.`/`??`, a ban on `effect`, removing `markForCheck` everywhere, rules about a11y and roles (no confirmed data).
