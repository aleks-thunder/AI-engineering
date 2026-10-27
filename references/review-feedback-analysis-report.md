# Отчёт: разбор 10 PR (ручная вставка)

**Дата анализа:** 2026-03-26  
**Источник:** `inbox/review-feedback/PR-01` … `PR-10` (`feedback.md`, `context.md`)  
**Метод:** по `prompts/review-feedback-analyzer.md` (ручные данные, без `comments.json`)  
**Ревьюер (техлид):** Adrian Diaconu — определён по авторам тредов в paste (не по UUID Bitbucket)  
**Сверка:** `../dashboard/.agents/skills/self-review/SKILL.md` (без правок skill)

Нормализованные выводы (без полных текстов комментариев): `data/review-log.jsonl` (локально).

---

## 1. Карта папок → Bitbucket

| Папка | PR (Bitbucket) | Тема (из context) |
|-------|----------------|-------------------|
| PR-01 | [829](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/829) | IT-25570 no-explicit-any regions/reports |
| PR-02 | [830](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/830) | no-explicit-any single models |
| PR-03 | [816](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/816) | IT-24247 Rules Engine condition |
| PR-04 | [812](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/812) | IT-24864 Lead price в client editor |
| PR-05 | [805](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/805) | Postback Pixel ↔ Setting |
| PR-06 | [769](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/769) | Rules Engine: data source, condition builder, actions |
| PR-07 | [776](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/776) | IT-24402 ACM ↔ MB tests |
| PR-08 | [747](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/747) | IT-23476 RE action subject/datasetParameters |
| PR-09 | [748](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/748) | IT-22447 emailList action |
| PR-10 | [656](https://bitbucket.org/lavinmedia/dashboard-moved/pull-requests/656) | IT-20283 Rules Logs UI |

Репозиторий в paste: **`lavinmedia/dashboard-moved`** (не `dashboard` из git remote).

**Объём:** ~231 содержательных комментария Adrian Diaconu (оценка по парсингу paste; мелкие «ok/thanks» не классифицировались отдельно).

---

## 2. Повторяющиеся темы техлида

Классификация: `likely_issue` / `suggestion` / `question` / `discussion`. Ниже — только **устойчивые** группы (≥2 PR или ≥5 похожих замечаний).

### 2.1 Лишний defensive coding (`?.`, `??`) — **likely_issue**, ~26 замечаний, PR-01,05–10

**Суть:** optional chaining там, где control required, тип уже сужен, или значение гарантировано конструктором/guard.

**Self-review:** уже есть блок «Defensive coding hygiene» (origin-only `?.` / `??`).  
**Пробел:** нет явного шага «пройтись по diff grep `?.` / `??` и спросить required FormControl / non-null type».

**Предложение для skill:** добавить короткий grep-чек в Step 3 после загрузки diff.

---

### 2.2 Signals: `effect()` вместо `computed()` / `linkedSignal`, double update — **likely_issue**, PR-03,06,07

**Суть:** производное state через `effect` + `.set`; одновременно patch локального signal и emit в parent → двойное обновление; ссылки на project skills (`effects.md`).

**Self-review:** покрыто (computed vs effect, controlled @Input round-trip).  
**Пробел:** нет явной формулировки «linkedSignal / model() для input sync» и «один источник правды — не signal + emit одного и того же».

**Предложение:** один bullet + ссылка на `linked-signal.md` / `inputs.md`.

---

### 2.3 `markForCheck` / лишний CD при signals — **likely_issue**, PR-04,05,08

**Суть:** после перехода на signals всё ещё `markForCheck` / «force change detection»; предложение перевести form/value в signal.

**Self-review:** есть «Change detection (OnPush)» с акцентом на **когда** markForCheck уместен.  
**Конфликт нюанса:** техлид чаще просит **убрать** markForCheck после signal-миграции; skill описывает markForCheck как предпочтительный vs detectChanges.

**Предложение:** уточнить в skill: «после signal-рефакторинга сначала проверить, можно ли убрать ChangeDetectorRef entirely; markForCheck — только если остался не-signal async gap».

---

### 2.4 HTTP: флаг loading не сбрасывается при ошибке — **likely_issue**, PR-05,07,10

**Суть:** при fail запроса inFlight остаётся true → retry невозможен; `catchError` / finalize.

**Self-review:** `takeUntilDestroyed` есть; **сброс флагов при ошибке** — слабо явно.

**Предложение:** bullet в Logic/RxJS: loading/error flags + `catchError`/`finalize`.

---

### 2.5 `takeUntilDestroyed` — **suggestion**, PR-05,07,10

**Self-review:** уже есть. Достаточно напоминания grep `subscribe(` без destroyRef.

---

### 2.6 Мёртвые ветки / неверный union vs runtime — **likely_issue**, PR-01,09

**Пример:** `0 | 1` vs проверка `boolean`; ветка if никогда не true.

**Self-review:** bullet «dead code / impossible states» — **покрыто**. Можно добавить мини-пример API numeric boolean.

---

### 2.7 CVA: default no-op `onChange` / `onTouch` — **suggestion**, PR-01,06,07,09

**Self-review:** **нет** отдельного пункта.

**Предложение:** подпункт в forms/CVA hygiene.

---

### 2.8 Extract methods для сложных условий — **suggestion**, PR-03,04,06,10

**Self-review:** template getters есть; **сложные TS-условия в .ts** — частично через architecture, не явно.

**Предложение:** «условие требует 2–3 перечитывания → private method с именем intent».

---

### 2.9 DTO / ApiResponse / контракт API — **likely_issue**, PR-01,02,05,06,07,10

**Суть:** смена serialize/validation без доказательства, что prod API уже так; case upper/lower; `ApiResponse<T>`.

**Self-review:** type safety + data-handling references — **частично**.  
**Предложение:** явный чек «изменение model/constructor → verify API contract (staging/prod, case)».

---

### 2.10 Template / права / `@if` — **likely_issue**, PR-04,06–10

**Суть:** роли admin/editor не видят блок, который должны; guard только на одной роли.

**Self-review:** logic correctness general — **нет** permission matrix.

**Предложение:** для `@if` с roles — таблица роль × видимость.

---

### 2.11 Прочее (единично или редко)

| Тема | PR | Self-review |
|------|-----|-------------|
| no-explicit-any: тип на declaration, не `any` | 01,02 | Покрыто (no any) |
| Standalone / host listeners | 06,09 | components.md |
| Contenteditable / RE action fields | 06,08,10 | Специфика домена — в self-review-extras или локальный RE checklist |
| Naming / typos | несколько | LOW, не в skill |

---

## 3. Что self-review уже ловит хорошо

- Запрет `any`, readonly, discriminated unions, factory для union variants  
- Signal immutability, computed vs effect (базово)  
- RxJS cleanup (`takeUntilDestroyed`)  
- Dead/unreachable conditions (общий bullet)  
- Defensive `?.` только at origin (концептуально совпадает с техлидом)  
- Controlled @Input / parent round-trip (близко к «double signal update»)

---

## 4. Приоритет правок self-review (после вашего OK)

1. **HIGH:** grep `?.`/`??` + HTTP loading flags on error  
2. **HIGH:** signal migration — убрать лишний CD; linkedSignal/model для input sync  
3. **MEDIUM:** CVA default callbacks; extract complex conditions; API contract check on model changes  
4. **MEDIUM:** permission `@if` matrix для role-gated UI  
5. **LOW:** усилить примеры dead branch для numeric booleans  

Skill **не изменялся** — только записи `status: proposed` в `review-log.jsonl`.

---

## 5. Ограничения этого анализа

- Данные — paste Activity UI, не structured API; возможны пропуски/outdated/diff noise.  
- Ответы автора и resolved-треды учитывались как контекст, не как дефекты.  
- Вопросы техлида без явного «fix» не поднимались в правила skill.  
- Импортёр Bitbucket **не использовался** для этого отчёта.

---

## 6. Следующий шаг для вас

1. Прочитать раздел 4 и сказать, какие пункты принять в self-review.  
2. Запустить self-review на текущей ветке с акцентом на пункты 2.1–2.4.  
3. При необходимости — второй цикл paste для новых PR в `PR-11+` или переименование папок под реальные номера BB.
