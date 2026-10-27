import { readFile } from 'node:fs/promises';
import { identitiesConflict, isRecord, normalizeAccountId, normalizeUuid, parseBitbucketRemote } from './identifiers.mjs';

export const ALLOWED_STATES = ['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED'];
const SLUG_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * @typedef {Object} Settings
 * @property {string} token
 * @property {'bearer' | 'basic'} auth
 * @property {string} atlassianEmail
 * @property {string} workspace
 * @property {string} repoSlug
 * @property {{ uuid: string, accountId: string }} author
 * @property {{ uuid: string, accountId: string }} techLead
 */

/**
 * @param {string} content
 * @returns {Record<string, string>}
 */
export function parseEnvFile(content) {
  /** @type {Record<string, string>} */
  const values = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) {
      throw new Error('Не удалось прочитать .env: строка без KEY=VALUE.');
    }
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

/**
 * @param {string} filePath
 * @returns {Promise<Record<string, string>>}
 */
export async function loadEnvFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    return parseEnvFile(content);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {};
    }
    if (error instanceof Error && error.message.startsWith('Не удалось прочитать')) {
      throw error;
    }
    throw new Error('Не удалось прочитать .env.');
  }
}

/**
 * @param {unknown} raw
 * @returns {{
 *   workspace: string,
 *   repoSlug: string,
 *   auth: 'bearer' | 'basic' | '',
 *   atlassianEmail: string,
 *   author: { uuid: string, accountId: string },
 *   techLead: { uuid: string, accountId: string },
 * }}
 */
export function parseLocalConfig(raw) {
  if (!isRecord(raw)) {
    throw new Error('review-feedback.local.json должен быть JSON-объектом.');
  }
  const author = isRecord(raw.author) ? raw.author : {};
  const techLead = isRecord(raw.techLead) ? raw.techLead : {};
  const auth = raw.auth === undefined || raw.auth === '' ? '' : raw.auth;
  if (auth !== '' && auth !== 'bearer' && auth !== 'basic') {
    throw new Error('Поле auth может быть только bearer или basic.');
  }
  return {
    workspace: optionalSlug(raw.workspace, 'workspace'),
    repoSlug: optionalSlug(raw.repoSlug, 'repoSlug'),
    auth,
    atlassianEmail: optionalString(raw.atlassianEmail),
    author: {
      uuid: optionalUuid(author.uuid, 'author.uuid'),
      accountId: optionalAccountId(author.accountId, 'author.accountId'),
    },
    techLead: {
      uuid: optionalUuid(techLead.uuid, 'techLead.uuid'),
      accountId: optionalAccountId(techLead.accountId, 'techLead.accountId'),
    },
  };
}

/**
 * @param {string[]} argv
 * @returns {{
 *   help: boolean,
 *   list: boolean,
 *   whoami: boolean,
 *   refresh: boolean,
 *   all: boolean,
 *   completed: boolean,
 *   limit: number | null,
 *   maxPages: number | null,
 *   pr: string | null,
 *   states: string[] | null,
 * }}
 */
export function parseCliArgs(argv) {
  const parsed = {
    help: false,
    list: false,
    whoami: false,
    refresh: false,
    all: false,
    completed: false,
    limit: /** @type {number | null} */ (null),
    maxPages: /** @type {number | null} */ (null),
    pr: /** @type {string | null} */ (null),
    states: /** @type {string[] | null} */ (null),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }
    if (token === '--list') {
      parsed.list = true;
      continue;
    }
    if (token === '--whoami') {
      parsed.whoami = true;
      continue;
    }
    if (token === '--refresh') {
      parsed.refresh = true;
      continue;
    }
    if (token === '--all') {
      parsed.all = true;
      continue;
    }
    if (token === '--completed') {
      parsed.completed = true;
      continue;
    }
    if (token === '--limit') {
      parsed.limit = readIntegerFlag(argv, index, '--limit');
      index += 1;
      continue;
    }
    if (token === '--max-pages') {
      parsed.maxPages = readIntegerFlag(argv, index, '--max-pages');
      index += 1;
      continue;
    }
    if (token === '--pr') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('После --pr нужен номер PR или URL.');
      }
      parsed.pr = value;
      index += 1;
      continue;
    }
    if (token === '--state') {
      const value = argv[index + 1];
      if (!value || !ALLOWED_STATES.includes(value)) {
        throw new Error(`--state принимает только: ${ALLOWED_STATES.join(', ')}.`);
      }
      parsed.states ??= [];
      parsed.states.push(value);
      index += 1;
      continue;
    }
    if (token === '--token' || token.startsWith('--token=')) {
      throw new Error('Не передавайте токен аргументом. Используйте BITBUCKET_API_TOKEN.');
    }
    throw new Error(`Неизвестный аргумент №${index + 1}. Токен нельзя передавать в командной строке. Смотрите --help.`);
  }

  return parsed;
}

/**
 * @param {ReturnType<typeof parseCliArgs>} args
 * @returns {{
 *   mode: 'help' | 'list' | 'whoami' | 'pr' | 'refresh' | 'all' | 'recent',
 *   limit: number | null,
 *   maxPages: number,
 *   pr: string | null,
 *   states: string[],
 *   errors: string[],
 * }}
 */
export function resolveMode(args) {
  /** @type {string[]} */
  const errors = [];
  const modes = [args.list, args.whoami, args.refresh, args.all, args.pr !== null].filter(Boolean);
  if (modes.length > 1) {
    errors.push('Укажите только один режим: --list, --whoami, --pr, --refresh или --all.');
  }
  if (args.completed && args.states) {
    errors.push('Используйте либо --completed, либо --state.');
  }
  if ((args.pr !== null || args.refresh || args.list || args.whoami) && args.limit !== null) {
    errors.push('--limit используется только для импорта последних PR.');
  }
  if ((args.pr !== null || args.refresh || args.list || args.whoami) && (args.completed || args.states)) {
    errors.push('Фильтр статуса используется с --limit и --all.');
  }

  let limit = args.limit;
  /** @type {ReturnType<typeof resolveMode>['mode']} */
  let mode = 'recent';
  if (args.help) {
    mode = 'help';
  } else if (args.list) {
    mode = 'list';
  } else if (args.whoami) {
    mode = 'whoami';
  } else if (args.pr !== null) {
    mode = 'pr';
  } else if (args.refresh) {
    mode = 'refresh';
  } else if (args.all) {
    mode = 'all';
  } else if (limit === null) {
    limit = 10;
  }

  if (mode === 'recent' && (!Number.isInteger(limit) || limit < 1 || limit > 500)) {
    errors.push('--limit должен быть целым числом от 1 до 500.');
  }
  const maxPages = args.maxPages ?? 200;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000) {
    errors.push('--max-pages должен быть целым числом от 1 до 1000.');
  }

  return {
    mode,
    limit: mode === 'recent' ? limit : null,
    maxPages,
    pr: args.pr,
    states: args.completed ? ['MERGED'] : args.states ?? ['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED'],
    errors,
  };
}

/**
 * @param {{
 *   env: Record<string, string | undefined>,
 *   fileEnv: Record<string, string>,
 *   localConfig: ReturnType<typeof parseLocalConfig> | null,
 *   gitRemoteUrl: string | null,
 * }} sources
 * @returns {Settings}
 */
export function resolveSettings(sources) {
  const envValue = (name) => {
    const fromEnv = sources.env[name];
    if (typeof fromEnv === 'string' && fromEnv !== '') {
      return fromEnv;
    }
    return sources.fileEnv[name] ?? '';
  };

  const local = sources.localConfig;
  const remote = sources.gitRemoteUrl ? parseBitbucketRemote(sources.gitRemoteUrl) : null;
  const workspace = firstNonEmpty(local?.workspace, remote?.workspace);
  const repoSlug = firstNonEmpty(local?.repoSlug, remote?.repoSlug);
  if (!workspace || !repoSlug) {
    throw new Error('Не удалось определить workspace и slug. Укажите их в review-feedback.local.json или проверьте remote bitbucket.');
  }

  const authSource = firstNonEmpty(envValue('BITBUCKET_AUTH'), local?.auth, 'bearer');
  if (authSource !== 'bearer' && authSource !== 'basic') {
    throw new Error('BITBUCKET_AUTH может быть только bearer или basic.');
  }

  const author = {
    uuid: optionalUuid(firstNonEmpty(envValue('BITBUCKET_AUTHOR_UUID'), local?.author.uuid), 'author uuid'),
    accountId: optionalAccountId(
      firstNonEmpty(envValue('BITBUCKET_AUTHOR_ACCOUNT_ID'), local?.author.accountId),
      'author account id',
    ),
  };
  const techLead = {
    uuid: optionalUuid(firstNonEmpty(envValue('BITBUCKET_TECH_LEAD_UUID'), local?.techLead.uuid), 'tech lead uuid'),
    accountId: optionalAccountId(
      firstNonEmpty(envValue('BITBUCKET_TECH_LEAD_ACCOUNT_ID'), local?.techLead.accountId),
      'tech lead account id',
    ),
  };
  if (identitiesConflict(author, techLead)) {
    throw new Error('Идентификатор техлида совпадает с вашим. Проверьте UUID и account id, скрипт их не угадывает.');
  }

  const token = envValue('BITBUCKET_API_TOKEN');
  const atlassianEmail = firstNonEmpty(envValue('BITBUCKET_ATLASSIAN_EMAIL'), local?.atlassianEmail);
  if (authSource === 'basic' && atlassianEmail === '') {
    throw new Error('Для auth=basic нужен Atlassian email в BITBUCKET_ATLASSIAN_EMAIL. Не используйте git email как догадку.');
  }
  assertValueIsNotToken(token, [workspace, repoSlug, atlassianEmail, author.uuid, author.accountId, techLead.uuid, techLead.accountId]);

  return {
    token,
    auth: authSource,
    atlassianEmail,
    workspace,
    repoSlug,
    author,
    techLead,
  };
}

/**
 * @param {string[]} argv
 * @param {number} index
 * @param {string} flag
 * @returns {number}
 */
function readIntegerFlag(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`После ${flag} нужно целое число.`);
  }
  return Number(value);
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function optionalSlug(value, label) {
  const text = optionalString(value);
  if (text !== '' && !SLUG_PATTERN.test(text)) {
    throw new Error(`Поле ${label} содержит недопустимые символы.`);
  }
  return text;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function optionalUuid(value, label) {
  const text = optionalString(value);
  if (text === '') {
    return '';
  }
  const uuid = normalizeUuid(text);
  if (uuid === '') {
    throw new Error(`Поле ${label} не похоже на Bitbucket UUID. Укажите значение вида {8-4-4-4-12}, не имя.`);
  }
  return uuid;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function optionalAccountId(value, label) {
  const text = optionalString(value);
  if (text === '') {
    return '';
  }
  const accountId = normalizeAccountId(text);
  if (accountId === '') {
    throw new Error(`Поле ${label} пустое или содержит пробелы.`);
  }
  return accountId;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function optionalString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {...(string | undefined)} values
 * @returns {string}
 */
function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value !== '') {
      return value;
    }
  }
  return '';
}

/**
 * @param {string} token
 * @param {readonly string[]} values
 */
function assertValueIsNotToken(token, values) {
  if (token.length < 8) {
    return;
  }
  if (values.some((value) => value === token)) {
    throw new Error('Похоже, токен записан в конфигурацию репозитория. Оставьте его только в окружении.');
  }
}
