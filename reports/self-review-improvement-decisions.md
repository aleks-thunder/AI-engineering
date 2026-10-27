# Self-review: решения по предложенным улучшениям

**Дата:** 2026-10-22
**Статус:** SR-01, 02, 03, 04, 06, 09 внедрены 2026-10-22 в `.agents/skills/self-review/SKILL.md` (по подтверждению владельца). Не закоммичено, фикстуры и before/after не запускались (§7).
**Остальное:** REJECT/DEFER без изменений; SR-05 остаётся REJECT.

Источники:

- Исторический: 10 PR из Bitbucket `lavinmedia/dashboard-moved`, ручная вставка страниц в `inbox/review-feedback/PR-01…PR-10`.
- Текущий код: GitHub `lavinmedia/dashboard` (`../dashboard`, только чтение).

Это разные репозитории. Номера строк и пути из исторических PR к текущему коду не применимы.

**Статус исходных PR (со слов владельца, 2026-10-22):** все комментарии во всех 10 PR закрыты, изменения давно в проде. Значит, замечания техлида были учтены или сняты в ходе ревью. Это не меняет статусы решений ниже, но снимает неопределённость «принял ли автор правку» (см. §3.2).

---



## 1. Executive summary

- Оценено **14 предложений**: **6 ACCEPT, 5 REJECT, 3 DEFER**.
  - 10 из `data/review-log.jsonl`.
  - 4 из строк §2.11 в `references/review-feedback-analysis-report.md`.
- Прежний анализ делал атрибуцию PR по ключевым словам, и она **часто неверна**. Сверка с текстом комментариев подтвердила далеко не все PR из лога (см. §3.3). Пример: у SR-07 (CVA) подтверждён 1 PR из 4, у SR-04 (HTTP-флаги) 1 из 3.
- Большинство тем **уже покрыты текстом skill**: `?.`/`??`, `effect` + `.set`, `takeUntilDestroyed`, dead code, controlled `@Input`. Техлид сам цитировал `effects.md` в двух PR. Значит, провал в **надёжности применения**, а не в отсутствии правила. Для них нужны точечные уточнения и процедурный шаг обнаружения, а не новые пункты.
- В skill есть **текст, который сам порождает ложные замечания**: «async callbacks / state updates — use `markForCheck()`» (SKILL.md, секция Change detection). Он противоречит замечаниям техлида про лишний `markForCheck` после signals. Это самое ценное исправление.
- Все предложения — правка формулировок существующих пунктов. Новых секций не требуется. Детерминированная автоматизация реалистична только для одного пункта (SR-12), и сначала нужен замер.

**Топ-3:**

1. **SR-03** — переписать секцию Change detection в виде решающего правила.
2. **SR-02** — уточнить `effect`/`linkedSignal` и случай «signal + emit одного и того же».
3. **SR-01** — добавить в Step 3 механический проход по добавленным `?.`/`??`.

---



## 2. Workspace migration summary


| Что                    | Состояние                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Новый workspace        | `/Users/aleksandrmojseenko/Documents/Capslock/Corporate/dashboard-ai-engineering/` (не git-репозиторий)                                     |
| Открытие               | `dashboard-ai-engineering.code-workspace`: папка `.` + `../dashboard` как read-only reference                                               |
| Перенесено             | `scripts/` (importer + tests), `prompts/`, `references/`, `data/`, `config/`, `inbox/review-feedback/`, `.env`, `.env.example`, `README.md` |
| Секреты                | `.env` скопирован побайтово, содержимое не читалось и не печаталось                                                                         |
| Пути                   | `workspaceRoot` в importer и пути в prompt/report/README переписаны на новый корень. Importer не удалён                                     |
| `.gitignore` workspace | Новый, локальный: `.env`, `config/review-feedback.local.json`, `inbox/review-feedback/*/`, `data/*.jsonl` и т.д.                            |
| Репозиторий приложения | `ai-engineering/` удалён из рабочей копии. HEAD `df9977e51`, ветка `master`, `git status` чистый                                            |
| Remotes                | Без изменений: `origin` = GitHub `lavinmedia/dashboard`, `bitbucket` = `lavinmedia/dashboard`                                               |


**Оговорка про** `.gitignore` **приложения.** В начале сессии у него была незакоммиченная правка ( `M .gitignore`) и добавленные в индекс файлы `ai-engineering/`. По явному выбору пользователя (`revert_all`) `.gitignore` возвращён к HEAD, а `ai-engineering/` удалён. Итоговое состояние = HEAD, а **не** исходное рабочее состояние. История, remotes и ветки не менялись. Исходная правка `.gitignore` нигде не сохранена.

---



## 3. Evidence audit



### 3.1 Артефакты


| Артефакт                                                                 | Роль                                     |
| ------------------------------------------------------------------------ | ---------------------------------------- |
| `inbox/review-feedback/PR-01…10/feedback.md`, `context.md`               | Первичные данные (вставка UI Bitbucket)  |
| `data/review-log.jsonl`                                                  | 10 записей `proposed`, поле `analyzedAt` |
| `references/review-feedback-analysis-report.md`                          | Прежний анализ (темы 2.1–2.11)           |
| `.agents/skills/self-review/SKILL.md` + `angular-developer{,-extras}`    | Текущее покрытие                         |
| `frontend/eslint.config.js`, `tsconfig`, `app.config.ts`, `package.json` | Автоматизация и контекст CD              |




### 3.2 Метод и пределы

- Я распарсил блоки комментариев техлида, дедуплицировал внутри PR и искал формулировки узкими запросами. Затем читал найденные тексты целиком.
- **«Подтверждено»** ниже = я нашёл и прочитал текст комментария. Это нижняя граница: вставка смешивает комментарии и куски диффа, а парсер не отделяет их надёжно.
- Известно (со слов владельца): все треды закрыты, код в проде. Из вставки это не видно (там нет статуса resolved).
- Не известны: исход каждого треда (исправлено, опровергнуто или принято как есть), таймстемпы, какой коммит комментируется. Ответы автора видны фрагментарно. «Закрыт» не равно «техлид был прав»: закрытие могло быть и после ответа автора.
- Вопросы техлида («are you sure…?») — это запросы на проверку, а не доказанные дефекты. Так они и классифицированы. Закрытие треда не превращает их в подтверждённые дефекты.
- Следствие для решений: замечания про `markForCheck`, `effect`, `?.`/`??` можно считать практикой, которую команда фактически применила в этих PR. Но подтверждённой рекуррентности это не добавляет, поэтому счёт подтверждённых PR в §3.3 и статусы не менялись.



### 3.3 Сверка PR из `review-log.jsonl` с текстами


| ID    | PR в логе                    | Подтверждено в тексте           | Комментарий                                                                                 |
| ----- | ---------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| SR-01 | 10 PR                        | 829, 830, 747, 748, 656         | 4 надёжно (830, 747, 748, 656); 829 только как код-хунк. «~26 замечаний» не воспроизводится |
| SR-02 | 816, 769, 776                | 816, 769, 776                   | Подтверждено. PR-10 использует NgRx ComponentStore `this.effect()`, а не Angular `effect()` |
| SR-03 | 812, 805, 747                | 812, 805 (+656 как контрпример) | 747 не найден                                                                               |
| SR-04 | 805, 776, 656                | 805                             | В 776 совпало слово «flag» в JSDoc, в 656 нет сброса-флага                                  |
| SR-05 | 805, 776, 656                | 805                             | Это про базовый класс `Destroyable`, а не про забытый unsubscribe                           |
| SR-06 | 829, 748                     | 829 (+776, 656 иные виды)       | 748 не подтверждён                                                                          |
| SR-07 | 829, 769, 776, 748           | 829                             | 769/776 — про `effect`, 748 — про controlled input                                          |
| SR-08 | 816, 812, 769, 656           | 816, 812, 769, 656              | Два из четырёх уже покрыты другими пунктами skill                                           |
| SR-09 | 829, 830, 805, 769, 776, 656 | 829, 830 (+776 косвенно)        | 805/769/656 не найдены                                                                      |
| SR-10 | 812, 769, 776, 747, 748, 656 | 812                             | Остальные совпадения — шум                                                                  |
| SR-11 | 829, 830                     | 829, 830                        | Подтверждено                                                                                |
| SR-12 | 769, 748                     | 776                             | Подтверждённый PR отличается от указанных                                                   |
| SR-13 | 769, 747, 656                | 769                             | Домен Rules Engine                                                                          |
| SR-14 | несколько                    | 776, 656                        | Техлид сам называет часть «preference»                                                      |




### 3.4 Несоответствия

1. **«~231 комментарий»** в отчёте не воспроизводится: пересчёт даёт 351 блоков, 210 уникальных, 201 содержательных. Эвристика «чистая проза» оставляет только 57 блоков. Число считать оценкой, не метрикой.
2. `analyzedAt: 2026-03-26` в логе и отчёте (датировано до 2026-10-22). Правильная дата анализа неизвестна. Не исправлено (данные не менялись).
3. **Тип** `likely_issue` присвоен прежним анализом. У техлида многие из них — вопросы или «если хотите». Теперь известно, что все треды закрыты, но не как именно.
4. **PR-10** `effect` — ComponentStore, а не Angular. Поэтому его замечания про мутабельное состояние относятся к RxJS-паттернам, а не к SR-02.
5. **Остаточная папка** `inbox/review-feedback/PR-paste/` (пустая заготовка).
6. **У предложений нет стабильных ID.** Здесь введены SR-01…SR-14 (порядок как в `review-log.jsonl`, затем строки §2.11).
7. **Противоречие между SR-01 и SR-09.** SR-01 говорит «доверяй типам, убери `?.`»; SR-09 говорит «тип может не соответствовать runtime». Разрешение: на границе (API/WS) типы нужно проверять, внутри кода — доверять. Формулировки ниже это разводят.



### 3.5 Критерии решений

- **ACCEPT** — есть подтверждённый пробел ИЛИ текст skill порождает ошибочные замечания, и правка узкая с низким риском ложных срабатываний.
- **REJECT** — уже покрыто, либо единичный стилевой случай, либо доменная специфика, либо правило навредит.
- **DEFER** — подтверждение слабое или нужен замер/решение команды до внедрения.

---



## 4. Decision table


| ID    | Предложение                                                | Статус     | Уверенность     | Цель                                                      | Приоритет |
| ----- | ---------------------------------------------------------- | ---------- | --------------- | --------------------------------------------------------- | --------- |
| SR-01 | Лишний `?.`/`??`: механический проход по diff              | **ACCEPT** | Средняя–высокая | Self-review, Step 3 + существующий блок Defensive hygiene | P3        |
| SR-02 | `effect`+`.set` → `computed`/`linkedSignal`; signal + emit | **ACCEPT** | Высокая         | Self-review, правка 2 существующих пунктов                | P2        |
| SR-03 | `markForCheck`/`detectChanges` рядом с signals             | **ACCEPT** | Средняя–высокая | Self-review, переписать секцию Change detection           | **P1**    |
| SR-04 | Флаг HTTP не сбрасывается при ошибке                       | **ACCEPT** | Низкая–средняя  | Self-review, дополнение пункта про `resource()`           | P5        |
| SR-05 | `takeUntilDestroyed` вместо ручного unsubscribe            | **REJECT** | Высокая         | Нет изменений (см. D-3)                                   | —         |
| SR-06 | Мёртвые ветки: примеры                                     | **ACCEPT** | Средняя         | Self-review, дополнить существующий bullet                | P4        |
| SR-07 | CVA: no-op `onChange`/`onTouch`                            | **REJECT** | Средняя         | Нет изменений                                             | —         |
| SR-08 | Extract сложных условий в private-методы                   | **DEFER**  | Средняя         | Self-review (LOW), позже                                  | —         |
| SR-09 | DTO/API: проверять контракт при правке типов               | **ACCEPT** | Низкая–средняя  | Self-review, Type safety                                  | P6        |
| SR-10 | Матрица ролей для `@if`                                    | **DEFER**  | Средняя         | Репозиторные conventions, при росте данных                | —         |
| SR-11 | `no-explicit-any`: тип в declaration                       | **REJECT** | Высокая         | Нет изменений                                             | —         |
| SR-12 | `@HostListener` → `host` metadata                          | **DEFER**  | Средняя         | Автоматизация (lint) после замера                         | —         |
| SR-13 | contenteditable / Rules Engine                             | **REJECT** | Средняя         | Нет изменений (локальная заметка опционально)             | —         |
| SR-14 | Именование / опечатки                                      | **REJECT** | Высокая         | Нет изменений                                             | —         |


Итого: **ACCEPT 6 / REJECT 5 / DEFER 3**.

Группы дублей:

- **A. Типы vs runtime:** SR-01, SR-06, SR-09. Разные направления, объединены правилом границы (§3.4, п.7).
- **B. Остатки после миграции на signals:** SR-02, SR-03. Одна волна изменений, два разных механизма.
- **C. Читаемость:** SR-08, SR-14.
- **D. Уже покрыто:** SR-05, SR-11, частично SR-06.

---



## 5. Detailed rationale



### SR-01 — лишний `?.` / `??` · ACCEPT (средняя–высокая)

**Evidence (подтверждено).**

- 830: «you don't need optional chaining since you asserted the client before».
- 747: «all those safety checks everywhere… should only be at the source… `getRawValue()`». Плюс «remove `?? new RuleActionsValue()` if we make the control `nonNullable: true`».
- 748: «I removed the `| null`… avoid redundant defensive mechanisms».
- 656: «defensive logic implies the store is not initialized correctly… defaults should happen at the source, inside the selectors».

**Покрытие.** Полностью описано в блоке «Defensive coding hygiene» (origin-only, `getRawValue()`, вопрос «can this realistically be null?»). Комментарии техлида — пересказ существующего правила. **Пробела в формулировке нет, пробел в обнаружении.**

**Польза.** Закрывает самый частый класс замечаний; задаёт механическую процедуру вместо «почувствуй».

**Риски.** Ложные срабатывания: `?.` на границе (API/WS), опциональный `viewChild()`, DOM-API, `form.value` (Partial). `noUncheckedIndexedAccess` **выключен**, поэтому `arr[0]?.x` бывает уместным при типе «не undefined». Не запрещать `?.`/`??` категорически.

**Цель.** Self-review (Step 3 + существующий блок). Новый пункт не нужен.

**Формулировка (черновик).**

> Before judging logic, list every added `?.` / `??` guard in the file diff (`git diff $DIFF_SCOPE -- <file>` filtered to added lines). For each, name what guarantees non-null at that point: declared type, `nonNullable` control, earlier assertion, or a default set at the origin (selector, factory, constructor). If such a guarantee exists and the value does not come from an external boundary (API/WebSocket payload, DOM, optional `viewChild()`), flag it and point to the origin where the default belongs. Do not flag guards on genuinely optional types or on boundary data.



### SR-02 — `effect` для производного state; double update · ACCEPT (высокая)

**Evidence.**

- 769: `effect` вызывает `valueState.set(...)`; техлид цитирует `effects.md` и предлагает `linkedSignal`.
- 776: `searchValue`, `pickerPosition` → `linkedSignal`, техлид: «this is an antipattern, and we have a skill».
- 816: «double signal update»: локальный `tokens.set(...)`, затем emit тех же токенов, которые родитель возвращает через input.

**Покрытие.** Есть: «`computed()` used for derivations, not `effect()` with `.set()`» и правило controlled `@Input`/`@Output`. `effects.md` грузится по триггеру `effect(`. Правило существовало и не сработало.

**Пробел.** Нет упоминания `linkedSignal` для записываемого производного состояния и нет явного случая «signal + emit одного значения».

**Риски.** `effect` законен для не-signal побочных эффектов; техлид сам оставил узкий `effect` для DOM-синхронизации. Категорический запрет недопустим. NgRx ComponentStore `this.effect()` — другое.

**Цель.** Существующие пункты self-review (объединить, не добавлять).

**Формулировка.**

> For each added `effect()` whose body calls `.set()`/`.update()` on a signal, classify it: derived from other signals → `computed()`; writable state that resets when a source changes → `linkedSignal()`; side effect on a non-signal target (DOM, logging, third-party API) → keep the `effect()`, narrowed to that side effect. Do not treat NgRx ComponentStore `this.effect()` as an Angular `effect()`.
>
> Do not both `.set()` a local signal and emit the same value when the parent pushes it back through an input; choose one source of truth (`model()`, `linkedSignal` over the input, or emit only).



### SR-03 — лишний `markForCheck` / `detectChanges` · ACCEPT (средняя–высокая)

**Evidence.**

- 805: «we can remove the mark for check here, since we now use signal, please test. I think the setting of a value is already marking for a check» (рядом с `pixelsLoading.set(false); cd.markForCheck()`).
- 812: техлид заменяет приём «vm + async + markForCheck» на `toSignal(control.valueChanges…)`.
- 656 (контрпример): `toggleOptions()` — «should work fine with OnPush, both are event handlers so Angular should trigger change detection».

**Контекст кода.** Angular 21.2.6, зональный (`provideZoneChangeDetection()`), 188 из 206 компонентов OnPush. `markForCheck` в 28 файлах, `detectChanges()` в 74.

**Покрытие и конфликт.** Секция Change detection говорит: «In all other cases — state updates, `writeValue`, `@Input` setters, async callbacks — use `cd.markForCheck()`». Это **толкает к добавлению** `markForCheck` **после записи в signal**, то есть противоположно замечаниям техлида.

**Что верно.** Signal, прочитанный в шаблоне, сам помечает view грязным. Обработчик события из шаблона того же компонента — тоже. А вот мутация не-signal поля из `subscribe`, таймера, `writeValue` или input-сеттера в OnPush `markForCheck` **требует**. Поэтому нельзя советовать убирать его везде. Само «please test» указывает, что техлид не уверен на 100%. Тред закрыт, но результат того теста во вставке не виден.

**Риски.** Ложное «лишнее», если состояние не-signal или меняется из внешнего источника (в т.ч. сервис, прочитанный другим view).

**Цель.** Переписать секцию Change detection (приоритет №1).

**Формулировка.**

> For every `ChangeDetectorRef` call, look at the state change next to it: (1) signal read by the template → no call needed; (2) plain-field mutation inside a template or host event handler of the same component → no call needed; (3) non-signal state mutated from a non-template origin (subscribe callback, timer, `writeValue`, input setter, external event) → `markForCheck()`, or move the state to a signal / `toSignal()`; (4) `detectChanges()` only when the next lines read the updated DOM. Flag a call only for cases (1)–(2), and suggest verifying by test.



### SR-04 — флаг HTTP не сбрасывается при ошибке · ACCEPT (низкая–средняя)

**Evidence.** Только 805: «If the HTTP fails, the flag stays true which means it will never be retried». Предложено `catchError` или `resource()` + `reload()`.

**Покрытие.** Частично: пункт про `resource()` и «`catchError` inside `switchMap`». Сброс флага на всех путях не описан.

**Анализ путей.** Флаг, выставленный до запроса, должен быть сброшен или сделан повторяемым при **успехе**, **ошибке** и **завершении/отмене** (`finalize`). Защёлка, сбрасываемая только при успехе, блокирует retry. Для самого запроса достаточно `resource()`.

**Риски.** Ложные срабатывания, если «флаг» намеренно одноразовый. Одно подтверждение, поэтому уверенность низкая. Принять только как дополнение существующего пункта.

**Цель.** Self-review: дополнить пункт про `resource()`.

**Формулировка.**

> A flag set before an HTTP call (`requested`, `loaded`, `inFlight`, `isLoading`) must be reset or made retryable on success, on error (`catchError`/error handler) and on completion or cancellation (`finalize`). A latch cleared only on success blocks retry. Prefer `resource()` with `reload()` when the flag mirrors request status.



### SR-05 — `takeUntilDestroyed` · REJECT (высокая)

**Evidence.** Только 805: «stop using `Destroyable`, use `DestroyRef`».

**Покрытие.** Пункт «Subscriptions cleaned up with `takeUntilDestroyed()`» уже есть. Предлагалось «напоминание grep» — это повтор.

**Наблюдение вне предложения.** 22 файла наследуют `Destroyable`, `takeUntilDestroyed` в 4 файлах. Это вопрос миграции и репозиторной конвенции (D-3), а не формулировки skill.

### SR-06 — мёртвые ветки · ACCEPT (средняя)

**Evidence.**

- 829: `useCustomBudgets` типа `0 | 1` никогда не бывает `boolean`.
- 776: `catchError`, который только перебрасывает ошибку.
- 656: `getAll` стал мёртвым после рефакторинга (в 748 не подтверждено).

**Покрытие.** Есть общий bullet «Conditions that can never be true…», плюс «redundant wrapper methods». Не покрыты: no-op `catchError` и метод без вызовов после рефакторинга.

**Цель.** Дополнить существующий bullet тремя примерами. Автоматизация (`no-unnecessary-condition`, поиск неиспользуемых экспортов) не оправдана, см. §8.

**Формулировка.**

> Examples: comparing a value to a type outside its declared union (`0 | 1` vs `boolean`); a `catchError` that only rethrows; a method left without callers after a refactor (search for the symbol before reporting).



### SR-07 — CVA: no-op `onChange`/`onTouch` · REJECT (средняя)

**Evidence.** Только 829, формулировка «if you want to ease up…».

**Анализ публичного контракта.** `registerOnChange/OnTouched` вызываются формами после создания; no-op по умолчанию безопасен, как и `onChange?.(…)`. Дефекта нет, это стиль. По умолчанию no-op может скрыть, что колбэк не зарегистрирован.

**Репозиторий.** 20 CVA-файлов, 9 с `?.()`, 0 с дефолтным no-op (по моему шаблону поиска). Правило шло бы против текущей практики.

### SR-08 — extract сложных условий · DEFER (средняя)

**Evidence.** 816 («2–3 re-reads»), 656 (двойное отрицание в сравнении фильтров), 812 (precompute в `vm`), 769 (regex). Последние два уже покрыты пунктами про template getters и именованные regex.

**Решение.** Остаток (условия в `.ts`) субъективен и плохо проверяется механически, рискует породить шум в отчёте «только факты». Вернуться после SR-01…03; при внедрении только LOW и с порогом (≥3 операндов или вложенное отрицание).

### SR-09 — контракт DTO/API · ACCEPT (низкая–средняя)

**Evidence.**

- 829: смена регистра значений union. Техлид: «Are you sure API both returns and expects lowercase?… fails in production». Затем обновление: «Confirmed with Alexandra, those are uppercase». Исход из вставки однозначно не восстанавливается; вероятно, правка была неверной. Тред закрыт, код в проде, то есть расхождение либо исправили, либо опровергли; какой из вариантов, неизвестно.
- 830: «Are you sure those are numbers? … parseInt», «Did the BE API payload change?» Без ответа.

Обе — из кампании `no-explicit-any`; правка типов молча меняла семантику.

**Классификация.** **Подтверждённых нарушений нет.** Есть одно вероятное (829) и вопросы без ответа (830). Это «проверь контракт», а не стиль.

**Покрытие.** Есть пункты про DTO/mappers и «verify claims outside the diff». Нет явного триггера на правку литералов, union и валидации в конструкторе.

**Риски.** Агент не знает BE: он может только искать доказательства в репозитории и должен писать «needs verification». Кампания `no-explicit-any` временная, повторяемость снизится.

**Цель.** Self-review, Type safety.

**Формулировка.**

> When the diff changes a literal union, enum, numeric/string/boolean field type, constructor validation, or a `serialize`/mapper for an API or WebSocket payload, look for evidence of the runtime shape (API model usage, mocks/fixtures, existing `parseInt`/casts). Report it as "needs verification" with the evidence checked; report a defect only if the repository contradicts the new type.



### SR-10 — матрица ролей для `@if` · DEFER (средняя)

**Evidence.** Только 812: «Shouldn't admin, leadPriceEditor, leadPriceToggler be also able to viewLeadPrice?» Реальный логический баг, но требует знания домена (какие права подразумевают другие).

**Анализ.** Без источника правды о ролях общий шаг превращается в догадки. Данных по a11y нет вообще (ни одного комментария), поэтому a11y-правило не предлагается.

**Решение.** Вернуться, если появятся ещё случаи. Возможное место: репозиторные conventions с картой подразумеваемых прав.

### SR-11 — `no-explicit-any` · REJECT (высокая)

Правило есть в skill («No `any`») и в preset typescript-eslint recommended (`eslint.config.js` его подключает). Я не запускал lint, чтобы это подтвердить.

### SR-12 — `@HostListener` → `host` · DEFER (средняя)

**Evidence.** 776. Это единственный подтверждённый PR.

**Данные.** 7 файлов с `@HostListener`, 43 с `host: {`. Установленный `angular-eslint` 21.3.1 содержит правило `prefer-host-metadata-property`, но оно только в конфиге `all`, а не в `recommended`, и в проекте не включено. В `angular-developer/references/components.md` про `host` ничего нет.

**Решение.** Лучше автоматизация, чем текст skill. Сначала замерить число нарушений (§7), затем решать. Не включалось и не проверялось.

### SR-13 — contenteditable / Rules Engine · REJECT (средняя)

Один PR (769), доменная специфика. Общему skill не нужно.

### SR-14 — именование / опечатки · REJECT (высокая)

LOW, часть техлид называет «preference». Линтеры и ревью людьми.

---



## 6. Recommended implementation sequence

Каждый шаг отдельным небольшим изменением. Не начинать без подтверждения.

1. **SR-03** — переписать Change detection (исправляет текст, порождающий ложные замечания).
2. **SR-02** — уточнить два существующих пункта.
3. **SR-01** — шаг обнаружения в Step 3 + правка блока Defensive hygiene.
4. **SR-06** — три примера в существующем bullet.
5. **SR-04** — дополнить пункт про `resource()`.
6. **SR-09** — триггер в Type safety.

Затем отдельно: замер для SR-12 и решения по §8.

---



## 7. Validation plan

Ничего из этого пока не выполнено.

1. **До правки:** собрать небольшой набор фикстур-диффов (положительные и отрицательные контрольные примеры на каждый пункт), например `?.` на границе API и `markForCheck` из `subscribe`. Исторические PR из Bitbucket недоступны как диффы, поэтому фикстуры синтетические или из текущей ветки.
2. **Запустить** self-review на фикстурах до и после изменения формулировки; сравнить находки. Критерий: нет новых ложных срабатываний на отрицательных контролях и находятся положительные.
3. **SR-03:** отдельно проверить на примере из 805 и на контрпримере (non-signal поле из `subscribe`), чтобы убедиться, что правило не советует убрать нужный `markForCheck`.
4. **SR-12:** запустить `prefer-host-metadata-property` во временном конфиге, посчитать нарушения (ожидание по grep: около 7 файлов, не проверено). Конфиг проекта не менять.
5. **Importer:** его тесты после переезда в этой сессии мной **не** перезапускались; перед использованием выполнить `node --test scripts/import-review-feedback.test.mjs`.
6. Проверить, что изменённый skill по-прежнему соблюдает собственные non-negotiables (порядок файлов, fences с реальными номерами, отчёт «только факты»).

---



## 8. Deferred items


| ID    | Тема                                                                                                   | Почему отложено                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| SR-08 | Extract сложных условий                                                                                | Субъективно, шум                                                                                                                  |
| SR-10 | Матрица ролей                                                                                          | Один случай, нужна доменная карта                                                                                                 |
| SR-12 | `host` metadata                                                                                        | Нужен замер, лучше lint                                                                                                           |
| D-1   | `@typescript-eslint/no-unnecessary-condition`                                                          | Нужны type-aware правила (`parserOptions.project`), сейчас не включены; нарушений не замерял, `noUncheckedIndexedAccess` выключен |
| D-2   | `explicit-member-accessibility` и кастомное правило по `templateUrl` (стр. в 776, техлид просил тикет) | Кастомное правило дорого поддерживать; не предложено ранее, поэтому вне подсчёта                                                  |
| D-3   | Миграция `Destroyable` (22 файла) → `DestroyRef`                                                       | Конвенция команды, не skill                                                                                                       |
| D-4   | Аудит 74 вызовов `detectChanges()`                                                                     | Вне данных ревью                                                                                                                  |
| D-5   | Исправить `2026-03-26` и «~231» в отчёте и логе                                                        | Данные не менялись по условию                                                                                                     |
| D-6   | Удалить пустую папку `PR-paste/`                                                                       | Не трогал без указания                                                                                                            |


---



## 9. Explicit non-changes

- Skill `.agents/skills/self-review/SKILL.md` и все остальные skills.
- Код приложения, `.gitignore` приложения (кроме отката к HEAD, см. §2), история, ветки и remotes обоих репозиториев.
- Importer не удалён и не менялся в этой работе. Bitbucket не открывался, аутентификация не выполнялась.
- Конфигурация ESLint и `tsconfig`.
- Ничего не закоммичено и не отправлено.
- Статусы в `data/review-log.jsonl` остаются `proposed`, не обновлены.
- Не вводятся: запрет `?.`/`??`, запрет `effect`, удаление `markForCheck` повсюду, правила про a11y и роли (нет подтверждённых данных).

