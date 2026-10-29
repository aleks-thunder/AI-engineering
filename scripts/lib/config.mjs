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
      throw new Error('Failed to read .env: line without KEY=VALUE.');
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
    if (error instanceof Error && error.message.startsWith('Failed to read')) {
      throw error;
    }
    throw new Error('Failed to read .env.');
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
    throw new Error('review-feedback.local.json must be a JSON object.');
  }
  const author = isRecord(raw.author) ? raw.author : {};
  const techLead = isRecord(raw.techLead) ? raw.techLead : {};
  const auth = raw.auth === undefined || raw.auth === '' ? '' : raw.auth;
  if (auth !== '' && auth !== 'bearer' && auth !== 'basic') {
    throw new Error('The auth field can only be bearer or basic.');
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
        throw new Error('--pr requires a PR number or URL.');
      }
      parsed.pr = value;
      index += 1;
      continue;
    }
    if (token === '--state') {
      const value = argv[index + 1];
      if (!value || !ALLOWED_STATES.includes(value)) {
        throw new Error(`--state accepts only: ${ALLOWED_STATES.join(', ')}.`);
      }
      parsed.states ??= [];
      parsed.states.push(value);
      index += 1;
      continue;
    }
    if (token === '--token' || token.startsWith('--token=')) {
      throw new Error('Do not pass the token as an argument. Use BITBUCKET_API_TOKEN.');
    }
    throw new Error(`Unknown argument #${index + 1}. The token must not be passed on the command line. See --help.`);
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
    errors.push('Specify only one mode: --list, --whoami, --pr, --refresh or --all.');
  }
  if (args.completed && args.states) {
    errors.push('Use either --completed or --state.');
  }
  if ((args.pr !== null || args.refresh || args.list || args.whoami) && args.limit !== null) {
    errors.push('--limit is used only when importing the latest PRs.');
  }
  if ((args.pr !== null || args.refresh || args.list || args.whoami) && (args.completed || args.states)) {
    errors.push('The status filter is used with --limit and --all.');
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
    errors.push('--limit must be an integer from 1 to 500.');
  }
  const maxPages = args.maxPages ?? 200;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000) {
    errors.push('--max-pages must be an integer from 1 to 1000.');
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
    throw new Error('Could not determine workspace and slug. Set them in review-feedback.local.json or check the bitbucket remote.');
  }

  const authSource = firstNonEmpty(envValue('BITBUCKET_AUTH'), local?.auth, 'bearer');
  if (authSource !== 'bearer' && authSource !== 'basic') {
    throw new Error('BITBUCKET_AUTH can only be bearer or basic.');
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
    throw new Error('The tech lead identifier matches yours. Check the UUID and account id; the script does not guess them.');
  }

  const token = envValue('BITBUCKET_API_TOKEN');
  const atlassianEmail = firstNonEmpty(envValue('BITBUCKET_ATLASSIAN_EMAIL'), local?.atlassianEmail);
  if (authSource === 'basic' && atlassianEmail === '') {
    throw new Error('auth=basic requires an Atlassian email in BITBUCKET_ATLASSIAN_EMAIL. Do not use the git email as a guess.');
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
    throw new Error(`${flag} requires an integer.`);
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
    throw new Error(`The ${label} field contains invalid characters.`);
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
    throw new Error(`The ${label} field does not look like a Bitbucket UUID. Provide a value like {8-4-4-4-12}, not a name.`);
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
    throw new Error(`The ${label} field is empty or contains spaces.`);
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
    throw new Error('The token appears to be written into the repository config. Keep it only in the environment.');
  }
}
