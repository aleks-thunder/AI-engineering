# AI engineering workspace

Локальное рабочее место для разбора ревью и улучшения skills и промптов. Оно лежит **вне** репозитория приложения и не попадает в его git.

- Приложение: `../dashboard` (GitHub `lavinmedia/dashboard`)
- Источник ревью: Bitbucket Cloud `lavinmedia/dashboard-moved`. Разбираемые PR приходят оттуда, а не из репозитория приложения.
- Self-review skill: [`../dashboard/.agents/skills/self-review/SKILL.md`](../dashboard/.agents/skills/self-review/SKILL.md). Из этого workspace его не меняют без явного подтверждения.

## Как открыть отдельно в Cursor

```bash
cursor /Users/aleksandrmojseenko/Documents/Capslock/Corporate/dashboard-ai-engineering
```

Или **File → Open Folder** и выберите эту папку. В обычное окно приложения она не добавляется.

Если нужно видеть обе папки в одном окне (например, при сверке с skill), откройте `dashboard-ai-engineering.code-workspace` из этой папки. Это отдельное окно, workspace приложения оно не меняет.

## Структура

```text
.
├── README.md
├── .env                      # секреты, только локально (в git не попадает)
├── .env.example
├── .gitignore                # страховка, если эту папку когда-нибудь сделают репозиторием
├── config/                   # review-feedback.example.json (+ локальный .local.json, не коммитится)
├── inbox/review-feedback/    # сырые данные ревью: PR-*/feedback.md, context.md (локально)
├── data/                     # review-log.jsonl: нормализованные выводы, не сырые комментарии
├── references/               # отчёты анализа (review-feedback-analysis-report.md)
├── reports/                  # решения по улучшениям (self-review-improvement-decisions.md)
├── prompts/                  # review-feedback-analyzer.md
└── scripts/                  # importer Bitbucket и тесты
```

Поле `skillPath` в `data/review-log.jsonl` считается от корня репозитория приложения (`../dashboard`).

## Где что хранится

- **Сырой feedback по PR:** `inbox/review-feedback/PR-<NN>/feedback.md` (вставка со страницы Bitbucket) и `context.md` (задача). Папки `PR-01`…`PR-10` соответствуют PR 829, 830, 816, 812, 805, 769, 776, 747, 748, 656 в `dashboard-moved`.
- **Отчёты и решения:** `references/` и `reports/`.
- **Выводы анализа:** `data/review-log.jsonl`, одна строка на вывод.

## Приватность

Сырые комментарии ревью, `.env` и локальный конфиг в git и в чаты без необходимости не отправляются. Не коммитьте, не публикуйте и не пересылайте `inbox/` и `.env`. Токен в чат не отправляйте.

## Как запустить анализ

В чате Cursor, открытом в этой папке:

```text
Разбери review feedback из inbox/review-feedback/PR-01 … PR-10 по prompts/review-feedback-analyzer.md.
Сравни повторяющиеся замечания техлида с ../dashboard/.agents/skills/self-review/SKILL.md.
Предложи правки skills и промптов, но не меняй их, пока я не подтвержу.
```

Анализ идёт по `feedback.md` и `context.md`. `comments.json` и `metadata.json` нужны только при импорте через API.

## Bitbucket importer (отложен)

Импорт через API готов, но сейчас не используется: у корпоративного токена нет права `read:pullrequest:bitbucket`. Основной источник — ручная вставка.

Если право появится, из корня этой папки:

```bash
cp .env.example .env
cp config/review-feedback.example.json config/review-feedback.local.json
node scripts/import-review-feedback.mjs --whoami
node scripts/import-review-feedback.mjs --limit 10
node scripts/import-review-feedback.mjs --pr <номер или URL>
node scripts/import-review-feedback.mjs --refresh
node scripts/import-review-feedback.mjs --list   # без сети
```

В `.env` задаются `BITBUCKET_API_TOKEN` и, при необходимости, идентификаторы автора и техлида (account id или UUID). В `config/review-feedback.example.json` указан `lavinmedia/dashboard-moved`. Определить remote автоматически нельзя, потому что эта папка не git-репозиторий.

Тесты (без сети):

```bash
node --test scripts/import-review-feedback.test.mjs
```
