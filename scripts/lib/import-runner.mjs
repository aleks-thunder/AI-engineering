import { mapComment, mergeComments } from './comments.mjs';
import { resolveMode } from './config.mjs';
import { BitbucketApiError, collectPages } from './http.mjs';
import {
  isRecord,
  mapUser,
  matchesIdentity,
  parsePullRequestRef,
} from './identifiers.mjs';
import {
  buildPullRequestsUrl,
  mapPullRequest,
  SELECTION_STRATEGY,
  selectPullRequestsFromPages,
  summarizeActivity,
} from './pull-requests.mjs';
import { renderFeedback } from './render-feedback.mjs';
import {
  findExistingPullRequestDirs,
  listSavedPullRequests,
  readJson,
  savePullRequestBundle,
  writeImportReport,
} from './storage.mjs';

export const HELP = `Импорт комментариев ревью из Bitbucket Cloud. Скрипт только читает API.

  node scripts/import-review-feedback.mjs --limit 10
  node scripts/import-review-feedback.mjs --pr <URL или номер>
  node scripts/import-review-feedback.mjs --refresh
  node scripts/import-review-feedback.mjs --all
  node scripts/import-review-feedback.mjs --list
  node scripts/import-review-feedback.mjs --whoami

--limit <n>       Последние n своих PR. Без режима по умолчанию берётся 10.
--pr <url|id>     Один PR текущего репозитория.
--refresh         Обновить уже сохранённые PR.
--all             Все свои PR выбранных статусов.
--completed       Только MERGED. Вместе с --limit или --all.
--state <STATE>   OPEN, MERGED, DECLINED или SUPERSEDED. Можно повторять.
--max-pages <n>   Предел страниц списка PR. По умолчанию 200.
--list            Локальный список без сети.
--whoami          UUID и account id владельца токена.

Отбор по умолчанию: sort=-updated_on, все статусы, страницы по next, первые N PR автора.
Токен только из BITBUCKET_API_TOKEN или .env в корне workspace.
`;

/**
 * @typedef {Object} ImportResult
 * @property {number} id
 * @property {string} title
 * @property {'complete' | 'partial' | 'failed'} status
 * @property {number} commentCount
 * @property {number} techLeadCommentCount
 * @property {string[]} warnings
 * @property {string[]} errors
 * @property {string | null} directoryName
 */

/**
 * @param {{
 *   cli: ReturnType<import('./config.mjs').parseCliArgs>,
 *   settings: import('./config.mjs').Settings | null,
 *   inboxDir: string,
 *   client: { getJson: (url: string) => Promise<unknown> } | null,
 *   now?: () => string,
 * }} options
 * @returns {Promise<{ exitCode: number, lines: string[], results: ImportResult[] }>}
 */
export async function runImport(options) {
  if (options.cli.help) {
    return { exitCode: 0, lines: [HELP], results: [] };
  }

  const mode = resolveMode(options.cli);
  if (mode.errors.length > 0) {
    return { exitCode: 2, lines: mode.errors, results: [] };
  }
  if (mode.mode === 'list') {
    const saved = await listSavedPullRequests(options.inboxDir);
    if (saved.length === 0) {
      return { exitCode: 0, lines: ['Сохранённых PR нет.'], results: [] };
    }
    return {
      exitCode: 0,
      lines: saved.map((item) => `PR ${item.id}: ${item.title || 'без названия'}; статус импорта ${item.status ?? 'не записан'}; комментариев ${item.commentCount ?? 'не записано'}`),
      results: [],
    };
  }

  if (!options.settings || !options.client) {
    return { exitCode: 2, lines: ['Не заданы параметры запуска.'], results: [] };
  }
  if (options.settings.token === '') {
    return {
      exitCode: 2,
      lines: ['Не задан BITBUCKET_API_TOKEN. Запишите его в окружение или в .env в корне workspace. Не отправляйте токен в чат.'],
      results: [],
    };
  }

  const importedAt = (options.now ?? (() => new Date().toISOString()))();
  /** @type {string[]} */
  const runWarnings = [];

  if (mode.mode === 'whoami') {
    return printCurrentUser(options.client, options.settings);
  }

  const configuredUser = await resolveConfiguredUser(options.client, options.settings, runWarnings);
  if ('exitCode' in configuredUser) {
    return { ...configuredUser, results: [] };
  }
  if (!options.settings.techLead.uuid && !options.settings.techLead.accountId) {
    runWarnings.push('Техлид не задан. Комментарии сохраняются, роль tech_lead не назначается. Укажите techLead.uuid или techLead.accountId.');
  }
  if (!configuredUser.uuid && configuredUser.accountId) {
    runWarnings.push('UUID автора не задан. Список PR фильтруется локально по account id и может занять больше страниц.');
  }

  /** @type {{ id: number }[]} */
  let targets = [];
  /** @type {Record<string, unknown>[]} */
  let discovered = [];
  if (mode.mode === 'pr') {
    let parsed;
    try {
      parsed = parsePullRequestRef(mode.pr ?? '');
    } catch (error) {
      return { exitCode: 2, lines: [error instanceof Error ? error.message : 'Некорректный PR.'], results: [] };
    }
    if (parsed.workspace && parsed.workspace !== options.settings.workspace) {
      return {
        exitCode: 2,
        lines: [`URL относится к workspace ${parsed.workspace}, конфигурация указывает ${options.settings.workspace}.`],
        results: [],
      };
    }
    if (parsed.repoSlug && parsed.repoSlug !== options.settings.repoSlug) {
      return {
        exitCode: 2,
        lines: [`URL относится к репозиторию ${parsed.repoSlug}, конфигурация указывает ${options.settings.repoSlug}.`],
        results: [],
      };
    }
    targets = [{ id: parsed.id }];
  } else if (mode.mode === 'refresh') {
    const saved = await listSavedPullRequests(options.inboxDir);
    if (saved.length === 0) {
      return { exitCode: 0, lines: ['Сохранённых PR нет. Сначала выполните импорт с --limit или --pr.'], results: [] };
    }
    targets = saved.map((item) => ({ id: item.id }));
  } else {
    try {
      const firstUrl = buildPullRequestsUrl({
        workspace: options.settings.workspace,
        repoSlug: options.settings.repoSlug,
        states: mode.states,
        authorUuid: configuredUser.uuid,
        pagelen: 50,
      }).toString();
      const collected = await collectPages(firstUrl, {
        getJson: options.client.getJson,
        maxPages: mode.maxPages,
        shouldStop: (pages) => {
          if (mode.limit === null) {
            return false;
          }
          return selectPullRequestsFromPages(pages, {
            author: configuredUser,
            limit: mode.limit,
            complete: true,
          }).pullRequests.length >= mode.limit;
        },
      });
      const selected = selectPullRequestsFromPages(collected.pages, {
        author: configuredUser,
        limit: mode.limit,
        complete: collected.complete,
      });
      discovered = selected.pullRequests;
      if (!selected.complete) {
        runWarnings.push('Список PR обрезан по --max-pages. Выборку нельзя считать полной.');
      }
      targets = discovered.flatMap((pullRequest) => (
        typeof pullRequest.id === 'number' ? [{ id: pullRequest.id }] : []
      ));
    } catch (error) {
      return { exitCode: 1, lines: [errorLine(error), ...runWarnings], results: [] };
    }
  }

  if (targets.length === 0) {
    const lines = [
      'Подходящих PR не найдено.',
      ...runWarnings,
    ];
    await writeImportReport(options.inboxDir, {
      importedAt,
      mode: mode.mode,
      warnings: runWarnings,
      results: [],
    });
    return { exitCode: runWarnings.some((warning) => warning.includes('нельзя считать полной')) ? 1 : 0, lines, results: [] };
  }

  /** @type {ImportResult[]} */
  const results = [];
  for (const target of targets) {
    const known = discovered.find((pullRequest) => pullRequest.id === target.id) ?? null;
    results.push(await importOne({
      id: target.id,
      known,
      settings: options.settings,
      configuredUser,
      client: options.client,
      inboxDir: options.inboxDir,
      importedAt,
      mode: mode.mode,
      states: mode.states,
      maxPages: mode.maxPages,
    }));
  }

  const failed = results.some((result) => result.status !== 'complete')
    || runWarnings.some((warning) => warning.includes('нельзя считать полной'));
  const lines = [
    ...runWarnings,
    ...results.flatMap((result) => formatResult(result)),
  ];
  await writeImportReport(options.inboxDir, {
    importedAt,
    workspace: options.settings.workspace,
    repoSlug: options.settings.repoSlug,
    mode: mode.mode,
    strategy: SELECTION_STRATEGY,
    states: mode.states,
    techLeadConfigured: Boolean(options.settings.techLead.uuid || options.settings.techLead.accountId),
    warnings: runWarnings,
    results: results.map((result) => ({
      id: result.id,
      title: result.title,
      status: result.status,
      commentCount: result.commentCount,
      techLeadCommentCount: result.techLeadCommentCount,
      warnings: result.warnings,
      errors: result.errors,
    })),
  });
  return { exitCode: failed ? 1 : 0, lines, results };
}

/**
 * @param {{ getJson: (url: string) => Promise<unknown> }} client
 * @param {import('./config.mjs').Settings} settings
 */
async function printCurrentUser(client, settings) {
  try {
    const payload = await client.getJson('https://api.bitbucket.org/2.0/user');
    const user = mapUser(payload);
    if (!user.uuid && !user.accountId) {
      return {
        exitCode: 1,
        lines: ['API не вернул UUID или account id. Укажите их вручную в локальной конфигурации.'],
        results: [],
      };
    }
    return {
      exitCode: 0,
      lines: [
        `uuid: ${user.uuid || 'не передан'}`,
        `account_id: ${user.accountId || 'не передан'}`,
        `display_name: ${user.displayName ?? 'не передано'}`,
        `workspace: ${settings.workspace}`,
        `repo: ${settings.repoSlug}`,
      ],
      results: [],
    };
  } catch (error) {
    return { exitCode: 1, lines: [errorLine(error)], results: [] };
  }
}

/**
 * @param {{ getJson: (url: string) => Promise<unknown> }} client
 * @param {import('./config.mjs').Settings} settings
 * @param {string[]} warnings
 * @returns {Promise<{ uuid: string, accountId: string } | { exitCode: number, lines: string[] }>}
 */
async function resolveConfiguredUser(client, settings, warnings) {
  if (settings.author.uuid || settings.author.accountId) {
    return settings.author;
  }
  try {
    const payload = await client.getJson('https://api.bitbucket.org/2.0/user');
    const user = mapUser(payload);
    if (!user.uuid && !user.accountId) {
      return {
        exitCode: 2,
        lines: ['API не вернул идентификатор текущего пользователя. Укажите author.uuid вручную.'],
      };
    }
    warnings.push('Автор взят из GET /2.0/user. Для этого нужен scope read:user:bitbucket.');
    return { uuid: user.uuid, accountId: user.accountId };
  } catch (error) {
    const hint = 'Укажите author.uuid или author.accountId в config/review-feedback.local.json. Скрипт не угадывает аккаунт.';
    return { exitCode: error instanceof BitbucketApiError && error.accessDenied ? 2 : 1, lines: [errorLine(error), hint] };
  }
}

/**
 * @param {{
 *   id: number,
 *   known: Record<string, unknown> | null,
 *   settings: import('./config.mjs').Settings,
 *   configuredUser: { uuid: string, accountId: string },
 *   client: { getJson: (url: string) => Promise<unknown> },
 *   inboxDir: string,
 *   importedAt: string,
 *   mode: string,
 *   states: readonly string[],
 *   maxPages: number,
 * }} input
 * @returns {Promise<ImportResult>}
 */
async function importOne(input) {
  const empty = {
    id: input.id,
    title: input.known && typeof input.known.title === 'string' ? input.known.title : '',
    status: /** @type {'failed'} */ ('failed'),
    commentCount: 0,
    techLeadCommentCount: 0,
    warnings: /** @type {string[]} */ ([]),
    errors: /** @type {string[]} */ ([]),
    directoryName: /** @type {string | null} */ (null),
  };

  let existing = null;
  try {
    existing = await readExisting(input.inboxDir, input.id);
  } catch (error) {
    empty.errors.push(error instanceof Error ? error.message : 'Не удалось прочитать сохранённые данные.');
    return empty;
  }

  /** @type {Record<string, unknown>} */
  let payload;
  try {
    payload = asRecord(await input.client.getJson(pullRequestUrl(input.settings, input.id)));
  } catch (error) {
    empty.errors.push(errorLine(error));
    await recordFailure(input, empty, existing);
    return empty;
  }

  let pullRequest;
  try {
    pullRequest = mapPullRequest(payload, input.settings);
  } catch (error) {
    empty.errors.push(error instanceof Error ? error.message : 'Неполный объект PR.');
    await recordFailure(input, empty, existing);
    return empty;
  }
  empty.title = pullRequest.title;

  if ((input.mode === 'pr' || input.mode === 'refresh') && !matchesIdentity(payload.author, input.configuredUser)) {
    empty.warnings.push('PR создан не настроенным аккаунтом. Он сохранён, потому что запрошен явно или уже был в inbox.');
  }
  if (!pullRequest.author.uuid && !pullRequest.author.accountId) {
    empty.warnings.push('API не передал идентификатор автора PR. Роль pull_request_author не назначается.');
  }

  let incoming = /** @type {import('./comments.mjs').StoredComment[]} */ ([]);
  let commentsComplete = false;
  try {
    const collected = await collectPages(`${pullRequestUrl(input.settings, input.id)}/comments?pagelen=100`, {
      getJson: input.client.getJson,
      maxPages: input.maxPages,
    });
    commentsComplete = collected.complete;
    incoming = mapCommentPages(collected.pages, {
      pullRequestAuthor: {
        uuid: pullRequest.author.uuid,
        accountId: pullRequest.author.accountId,
      },
      configuredUser: input.configuredUser,
      techLead: input.settings.techLead,
    });
  } catch (error) {
    empty.errors.push(errorLine(error));
    await recordFailure(input, empty, existing, pullRequest);
    return empty;
  }

  if (!commentsComplete) {
    empty.status = 'partial';
    empty.errors.push('Комментарии загружены не полностью. comments.json не заменён.');
    empty.commentCount = existing?.comments.length ?? 0;
    empty.techLeadCommentCount = countRole(existing?.comments ?? [], 'tech_lead');
    await recordFailure(input, empty, existing, pullRequest);
    return empty;
  }

  if (pullRequest.reportedCommentCount !== null && incoming.length < pullRequest.reportedCommentCount) {
    empty.warnings.push(
      `API указал comment_count=${pullRequest.reportedCommentCount}, пагинация вернула ${incoming.length}.`,
    );
  }

  const merged = mergeComments(existing?.comments ?? [], incoming);
  /** @type {ReturnType<typeof summarizeActivity>} */
  let reviewEvents = existing?.reviewEvents ?? [];
  let activityStatus = 'not_loaded';
  try {
    const activity = await collectPages(`${pullRequestUrl(input.settings, input.id)}/activity?pagelen=50`, {
      getJson: input.client.getJson,
      maxPages: input.maxPages,
    });
    if (!activity.complete) {
      activityStatus = 'failed';
      empty.warnings.push('История activity загружена не полностью. Прежние события ревью сохранены.');
    } else {
      reviewEvents = summarizeActivity(activity.pages.flat());
      activityStatus = 'complete';
    }
  } catch (error) {
    activityStatus = 'failed';
    empty.warnings.push(`События ревью не обновлены: ${errorLine(error)}`);
  }

  const status = activityStatus === 'complete' ? 'complete' : 'partial';
  const feedback = renderFeedback(merged, pullRequest, input.importedAt);
  try {
    const saved = await savePullRequestBundle({
      inboxDir: input.inboxDir,
      pullRequest,
      metadata: metadataDocument({
        pullRequest,
        reviewEvents,
        importedAt: input.importedAt,
        status,
        states: input.states,
        comments: merged,
        activityStatus,
        errors: empty.errors,
        warnings: empty.warnings,
      }),
      commentsDocument: {
        schemaVersion: 1,
        pullRequestId: pullRequest.id,
        importedAt: input.importedAt,
        complete: true,
        comments: merged,
      },
      feedback,
    });
    empty.directoryName = saved.directory.split(/[\\/]/).at(-1) ?? null;
    if (saved.feedbackStatus === 'preserved') {
      empty.warnings.push('feedback.md не перезаписан: в нём нет маркера генератора. Заметки оставлены как есть.');
    }
    empty.status = status;
    empty.commentCount = merged.length;
    empty.techLeadCommentCount = countRole(merged, 'tech_lead');
  } catch (error) {
    empty.errors.push(error instanceof Error ? error.message : 'Не удалось записать файлы.');
    empty.status = 'failed';
  }
  return empty;
}

/**
 * @param {string} inboxDir
 * @param {number} id
 */
async function readExisting(inboxDir, id) {
  const directories = await findExistingPullRequestDirs(inboxDir, id);
  if (directories.length > 1) {
    throw new Error(`Найдено несколько папок для PR ${id}. Импорт этого PR остановлен.`);
  }
  if (directories.length === 0) {
    return null;
  }
  const metadata = await readJson(`${directories[0]}/metadata.json`);
  const commentsDocument = await readJson(`${directories[0]}/comments.json`);
  if (commentsDocument !== null && (!isRecord(commentsDocument) || !Array.isArray(commentsDocument.comments))) {
    throw new Error('comments.json повреждён. Файл не перезаписан автоматически.');
  }
  const comments = commentsDocument && isRecord(commentsDocument)
    ? commentsDocument.comments.filter((comment) => isRecord(comment) && typeof comment.id === 'number')
    : [];
  if (commentsDocument && isRecord(commentsDocument) && comments.length !== commentsDocument.comments.length) {
    throw new Error('comments.json содержит комментарий без id. Файл не перезаписан автоматически.');
  }
  const reviewEvents = isRecord(metadata)
    && isRecord(metadata.pullRequest)
    && Array.isArray(metadata.pullRequest.reviewEvents)
    ? metadata.pullRequest.reviewEvents
    : [];
  return { comments, reviewEvents };
}

/**
 * @param {Parameters<typeof importOne>[0]} input
 * @param {ImportResult} result
 * @param {Awaited<ReturnType<typeof readExisting>>} existing
 * @param {ReturnType<typeof mapPullRequest> | null} [pullRequest]
 */
async function recordFailure(input, result, existing, pullRequest = null) {
  if (!pullRequest && !existing) {
    return;
  }
  const storedComments = existing?.comments ?? [];
  result.commentCount = storedComments.length;
  result.techLeadCommentCount = countRole(storedComments, 'tech_lead');
  const fallback = pullRequest ?? {
    id: input.id,
    title: result.title,
  };
  try {
    const saved = await savePullRequestBundle({
      inboxDir: input.inboxDir,
      pullRequest: fallback,
      metadata: metadataDocument({
        pullRequest,
        reviewEvents: existing?.reviewEvents ?? [],
        importedAt: input.importedAt,
        status: result.status === 'partial' ? 'partial' : 'failed',
        states: input.states,
        comments: storedComments,
        activityStatus: 'unchanged',
        errors: result.errors,
        warnings: result.warnings,
        keepStoredPullRequest: pullRequest === null,
      }),
      commentsDocument: null,
      feedback: null,
    });
    result.directoryName = saved.directory.split(/[\\/]/).at(-1) ?? null;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Не удалось записать статус ошибки.');
  }
}

/**
 * @param {{
 *   pullRequest: ReturnType<typeof mapPullRequest>,
 *   reviewEvents: ReturnType<typeof summarizeActivity>,
 *   importedAt: string,
 *   status: 'complete' | 'partial' | 'failed',
 *   states: readonly string[],
 *   comments: readonly { authorRole?: string }[],
 *   activityStatus: string,
 *   errors: readonly string[],
 *   warnings: readonly string[],
 *   keepStoredPullRequest?: boolean,
 * }} input
 */
function metadataDocument(input) {
  /** @type {Record<string, unknown>} */
  const document = {
    schemaVersion: 1,
    import: {
      status: input.status,
      importedAt: input.importedAt,
      strategy: SELECTION_STRATEGY,
      states: [...input.states],
      commentCount: input.comments.length,
      techLeadCommentCount: countRole(input.comments, 'tech_lead'),
      pullRequestAuthorCommentCount: countRole(input.comments, 'pull_request_author'),
      otherCommentCount: countRole(input.comments, 'other'),
      activityStatus: input.activityStatus,
      errors: [...input.errors],
      warnings: [...input.warnings],
    },
  };
  if (!input.keepStoredPullRequest && input.pullRequest) {
    document.pullRequest = {
      ...input.pullRequest,
      reviewEvents: input.reviewEvents,
    };
  }
  return document;
}

/**
 * @param {readonly unknown[][]} pages
 * @param {Parameters<typeof mapComment>[1]} identities
 */
function mapCommentPages(pages, identities) {
  /** @type {Map<number, import('./comments.mjs').StoredComment>} */
  const byId = new Map();
  for (const page of pages) {
    for (const raw of page) {
      const comment = mapComment(raw, identities);
      byId.set(comment.id, comment);
    }
  }
  return [...byId.values()];
}

/**
 * @param {readonly { authorRole?: string }[]} comments
 * @param {string} role
 */
function countRole(comments, role) {
  return comments.filter((comment) => comment.authorRole === role).length;
}

/**
 * @param {import('./config.mjs').Settings} settings
 * @param {number} id
 */
function pullRequestUrl(settings, id) {
  return `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(settings.workspace)}/${encodeURIComponent(settings.repoSlug)}/pullrequests/${id}`;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function asRecord(value) {
  if (!isRecord(value)) {
    throw new Error('Ответ PR не является объектом.');
  }
  return value;
}

/**
 * @param {unknown} error
 */
function errorLine(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Неизвестная ошибка API.';
}

/**
 * @param {ImportResult} result
 * @returns {string[]}
 */
function formatResult(result) {
  const folder = result.directoryName ? ` → ${result.directoryName}` : '';
  return [
    `PR ${result.id}: ${result.title || 'без названия'}; ${result.status}; комментариев ${result.commentCount}; техлида ${result.techLeadCommentCount}${folder}`,
    ...result.warnings.map((warning) => `  предупреждение: ${warning}`),
    ...result.errors.map((error) => `  ошибка: ${error}`),
  ];
}
