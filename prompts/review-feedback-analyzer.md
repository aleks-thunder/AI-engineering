# Разбор локального review feedback

Используй этот промпт только после того, как feedback уже лежит локально (ручная вставка или импорт). Не ходи в Bitbucket и не вызывай внешние модели. Не редактируй `../dashboard/.agents/skills/self-review/SKILL.md` и другие skills, пока пользователь явно не подтвердит конкретную правку.

## Источники

- Сырые данные: `inbox/review-feedback/PR-*/feedback.md`, `context.md` (и `comments.json`, `metadata.json`, если был импорт через API)
- Нормализованный журнал выводов: `data/review-log.jsonl`
- Self-review: `../dashboard/.agents/skills/self-review/SKILL.md` и те references, на которые он опирается (пути skill относительно репозитория приложения `../dashboard`)

`comments.json` и `feedback.md` — исходная история. `review-log.jsonl` — только выводы. Не копируй туда полные тексты комментариев.

## Как разбирать

1. Прочитай `metadata.json` и отбери комментарии с `authorRole: tech_lead`. Если таких нет, остановись и напиши, что идентификатор техлида не сопоставлен. Не назначай техлида по display name.
2. Подтягивай ответы автора PR и других участников как контекст треда (`parentId`), а не как отдельные дефекты.
3. Для каждого содержательного комментария техлида выбери один вид: `question`, `suggestion`, `discussion`, `likely_issue`, `unknown`. Вопрос или обсуждение не записывай как дефект.
4. Сгруппируй только повторяющиеся `likely_issue` и устойчивые `suggestion`. Единичный спорный комментарий не превращай в правило skill.
5. Сверь группу с self-review skill. Если правило уже есть, предложи ссылку на него, а не новый пункт. Если правила нет, предложи короткую формулировку и файл, куда её можно добавить.
6. Покажи предложение пользователю. После подтверждения можно дописать одну строку JSONL на группу:

```json
{"analyzedAt":"","pullRequestIds":[],"sourceCommentIds":[],"kind":"likely_issue","summary":"","suggestedSkillChange":"","skillPath":"","status":"proposed"}
```

`status` оставляй `proposed`, пока пользователь не примет правку skill. После принятия можно сменить его на `accepted`. Сам skill до подтверждения не меняй.
