# Report: analysis of 10 PRs (manual paste)

> Note: this first analysis is partly inaccurate (PR attribution, comment counts). Trust `reports/self-review-improvement-decisions.md` (§3.3, §3.4) where they differ.

**Analysis date:** 2026-03-26  
**Source:** `inbox/review-feedback/PR-01` … `PR-10` (`feedback.md`, `context.md`)  
**Method:** following `prompts/review-feedback-analyzer.md` (manual data, no `comments.json`)  
**Reviewer (tech lead):** Adrian Diaconu, identified by thread authors in the paste (not by Bitbucket UUID)  
**Cross-check:** `../dashboard/.agents/skills/self-review/SKILL.md` (skill not modified)

Normalized findings (without full comment texts): `data/review-log.jsonl` (local).

---

## 1. Folder → Bitbucket map

| Folder | PR (Bitbucket) | Topic (from context) |
|-------|----------------|-------------------|
| PR-01 | [829](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/829) | IT-25570 no-explicit-any regions/reports |
| PR-02 | [830](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/830) | no-explicit-any single models |
| PR-03 | [816](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/816) | IT-24247 Rules Engine condition |
| PR-04 | [812](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/812) | IT-24864 Lead price in client editor |
| PR-05 | [805](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/805) | Postback Pixel ↔ Setting |
| PR-06 | [769](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/769) | Rules Engine: data source, condition builder, actions |
| PR-07 | [776](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/776) | IT-24402 ACM ↔ MB tests |
| PR-08 | [747](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/747) | IT-23476 RE action subject/datasetParameters |
| PR-09 | [748](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/748) | IT-22447 emailList action |
| PR-10 | [656](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/656) | IT-20283 Rules Logs UI |

Repository in the paste: **`lavinmedia/dashboard-moved`** (not `dashboard` from the git remote).

**Volume:** ~231 substantive comments by Adrian Diaconu (estimate from parsing the paste; minor "ok/thanks" comments were not classified separately).

---

## 2. Recurring tech lead themes

Classification: `likely_issue` / `suggestion` / `question` / `discussion`. Only **stable** groups are listed (≥2 PRs or ≥5 similar comments).

### 2.1 Excess defensive coding (`?.`, `??`): **likely_issue**, ~26 comments, PR-01, 05–10

**Gist:** optional chaining where the control is required, the type is already narrowed, or the value is guaranteed by the constructor/guard.

**Self-review:** there is already a "Defensive coding hygiene" block (origin-only `?.` / `??`).  
**Gap:** no explicit step "go through the diff, grep `?.` / `??` and ask whether the FormControl is required / the type is non-null".

**Skill proposal:** add a short grep check in Step 3 after loading the diff.

---

### 2.2 Signals: `effect()` instead of `computed()` / `linkedSignal`, double update: **likely_issue**, PR-03, 06, 07

**Gist:** derived state via `effect` + `.set`; patching a local signal and emitting to the parent at the same time → double update; references to project skills (`effects.md`).

**Self-review:** covered (computed vs effect, controlled @Input round-trip).  
**Gap:** no explicit wording on "linkedSignal / model() for input sync" and "single source of truth, not signal + emit of the same thing".

**Proposal:** one bullet + a link to `linked-signal.md` / `inputs.md`.

---

### 2.3 `markForCheck` / unnecessary CD with signals: **likely_issue**, PR-04, 05, 08

**Gist:** after moving to signals there is still `markForCheck` / "force change detection"; the suggestion is to turn the form/value into a signal.

**Self-review:** has "Change detection (OnPush)" focused on **when** markForCheck is appropriate.  
**Nuance conflict:** the tech lead more often asks to **remove** markForCheck after a signal migration; the skill describes markForCheck as preferred over detectChanges.

**Proposal:** clarify in the skill: "after a signal refactor first check whether ChangeDetectorRef can be removed entirely; markForCheck only if a non-signal async gap remains".

---

### 2.4 HTTP: loading flag not reset on error: **likely_issue**, PR-05, 07, 10

**Gist:** when the request fails, inFlight stays true → retry is impossible; `catchError` / finalize.

**Self-review:** `takeUntilDestroyed` is there; **resetting flags on error** is weakly explicit.

**Proposal:** a bullet in Logic/RxJS: loading/error flags + `catchError`/`finalize`.

---

### 2.5 `takeUntilDestroyed`: **suggestion**, PR-05, 07, 10

**Self-review:** already there. A grep reminder for `subscribe(` without destroyRef is enough.

---

### 2.6 Dead branches / wrong union vs runtime: **likely_issue**, PR-01, 09

**Example:** `0 | 1` vs a `boolean` check; an if branch that is never true.

**Self-review:** the "dead code / impossible states" bullet: **covered**. A mini-example with an API numeric boolean can be added.

---

### 2.7 CVA: default no-op `onChange` / `onTouch`: **suggestion**, PR-01, 06, 07, 09

**Self-review:** **no** dedicated item.

**Proposal:** a sub-bullet in forms/CVA hygiene.

---

### 2.8 Extract methods for complex conditions: **suggestion**, PR-03, 04, 06, 10

**Self-review:** template getters exist; **complex TS conditions in .ts** are partly covered via architecture, not explicitly.

**Proposal:** "a condition that needs 2–3 re-reads → a private method named for its intent".

---

### 2.9 DTO / ApiResponse / API contract: **likely_issue**, PR-01, 02, 05, 06, 07, 10

**Gist:** changing serialize/validation without proof that prod API already behaves that way; upper/lower case; `ApiResponse<T>`.

**Self-review:** type safety + data-handling references: **partial**.  
**Proposal:** an explicit check "model/constructor change → verify API contract (staging/prod, case)".

---

### 2.10 Template / permissions / `@if`: **likely_issue**, PR-04, 06–10

**Gist:** admin/editor roles do not see a block they should; a guard on only one role.

**Self-review:** general logic correctness: **no** permission matrix.

**Proposal:** for `@if` with roles, a role × visibility table.

---

### 2.11 Other (single or rare)

| Topic | PR | Self-review |
|------|-----|-------------|
| no-explicit-any: type at the declaration, not `any` | 01, 02 | Covered (no any) |
| Standalone / host listeners | 06, 09 | components.md |
| Contenteditable / RE action fields | 06, 08, 10 | Domain-specific: self-review-extras or a local RE checklist |
| Naming / typos | several | LOW, not in the skill |

---

## 3. What self-review already catches well

- Ban on `any`, readonly, discriminated unions, factories for union variants  
- Signal immutability, computed vs effect (basics)  
- RxJS cleanup (`takeUntilDestroyed`)  
- Dead/unreachable conditions (general bullet)  
- Defensive `?.` only at origin (conceptually matches the tech lead)  
- Controlled @Input / parent round-trip (close to "double signal update")

---

## 4. Priority of self-review changes (after your OK)

1. **HIGH:** grep `?.`/`??` + HTTP loading flags on error  
2. **HIGH:** signal migration: remove unnecessary CD; linkedSignal/model for input sync  
3. **MEDIUM:** CVA default callbacks; extract complex conditions; API contract check on model changes  
4. **MEDIUM:** permission `@if` matrix for role-gated UI  
5. **LOW:** strengthen dead-branch examples for numeric booleans  

The skill was **not modified**, only `status: proposed` records in `review-log.jsonl`.

---

## 5. Limitations of this analysis

- The data is a paste of the Activity UI, not structured API data; gaps/outdated items/diff noise are possible.  
- Author replies and resolved threads were taken as context, not as defects.  
- Tech lead questions without an explicit "fix" were not raised into skill rules.  
- The Bitbucket importer was **not used** for this report.

---

## 6. Next step for you

1. Read section 4 and say which items to accept into self-review.  
2. Run self-review on the current branch with emphasis on items 2.1–2.4.  
3. If needed, a second paste cycle for new PRs in `PR-11+` or renaming the folders to the real BB numbers.
