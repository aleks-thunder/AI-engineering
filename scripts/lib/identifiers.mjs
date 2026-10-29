const UUID_PATTERN =
  /^\{?([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\}?$/;

/**
 * @typedef {Object} Identity
 * @property {string} uuid
 * @property {string} accountId
 */

/**
 * @typedef {Object} StoredUser
 * @property {string} uuid
 * @property {string} accountId
 * @property {string | null} displayName
 * @property {string | null} nickname
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeUuid(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const match = UUID_PATTERN.exec(value.trim());
  if (!match) {
    return '';
  }
  return `{${match[1].toLowerCase()}}`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeAccountId(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed) || trimmed.length > 128) {
    return '';
  }
  return trimmed;
}

/**
 * @param {unknown} value
 * @returns {boolean | null}
 */
export function optionalBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function optionalInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/**
 * @param {unknown} user
 * @returns {StoredUser}
 */
export function mapUser(user) {
  const record = isRecord(user) ? user : {};
  const accountId = normalizeAccountId(record.account_id ?? record.accountId);
  return {
    uuid: normalizeUuid(record.uuid),
    accountId,
    displayName: typeof record.display_name === 'string'
      ? record.display_name
      : typeof record.displayName === 'string'
        ? record.displayName
        : null,
    nickname: typeof record.nickname === 'string' ? record.nickname : null,
  };
}

/**
 * @param {unknown} user
 * @param {Identity} identity
 * @returns {boolean}
 */
export function matchesIdentity(user, identity) {
  const mapped = mapUser(user);
  const uuidComparable = identity.uuid !== '' && mapped.uuid !== '';
  const accountComparable = identity.accountId !== '' && mapped.accountId !== '';
  if (uuidComparable && mapped.uuid !== identity.uuid) {
    return false;
  }
  if (accountComparable && mapped.accountId !== identity.accountId) {
    return false;
  }
  return uuidComparable || accountComparable;
}

/**
 * @param {Identity} left
 * @param {Identity} right
 * @returns {boolean}
 */
export function identitiesConflict(left, right) {
  if (left.uuid !== '' && left.uuid === right.uuid) {
    return true;
  }
  return left.accountId !== '' && left.accountId === right.accountId;
}

/**
 * @param {string} remoteUrl
 * @returns {{ workspace: string, repoSlug: string } | null}
 */
export function parseBitbucketRemote(remoteUrl) {
  const trimmed = remoteUrl.trim();
  const ssh = /^git@bitbucket\.org:([^/]+)\/(.+?)(?:\.git)?$/.exec(trimmed);
  if (ssh) {
    return { workspace: ssh[1], repoSlug: ssh[2] };
  }
  const https = /^https:\/\/bitbucket\.org\/([^/]+)\/(.+?)(?:\.git)?$/.exec(trimmed);
  if (https) {
    return { workspace: https[1], repoSlug: https[2] };
  }
  return null;
}

/**
 * @param {string} input
 * @returns {{ id: number, workspace: string | null, repoSlug: string | null }}
 */
export function parsePullRequestRef(input) {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    return { id: Number(trimmed), workspace: null, repoSlug: null };
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Expected a PR number or a URL https://bitbucket.org/{workspace}/{repo}/pull-requests/{id}.');
  }

  if (url.hostname !== 'bitbucket.org') {
    throw new Error('The link must point to bitbucket.org.');
  }

  const parts = url.pathname.split('/').filter((part) => part !== '');
  if (parts.length < 4 || parts[2] !== 'pull-requests' || !/^\d+$/.test(parts[3])) {
    throw new Error('Expected a URL like https://bitbucket.org/{workspace}/{repo}/pull-requests/{id}.');
  }

  return {
    id: Number(parts[3]),
    workspace: parts[0],
    repoSlug: parts[1],
  };
}

/**
 * @param {number} id
 * @param {string} title
 * @returns {string}
 */
export function pullRequestDirectoryName(id, title) {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug ? `PR-${id}-${slug}` : `PR-${id}`;
}

/**
 * @param {unknown} value
 * @param {readonly string[]} hosts
 * @returns {string | null}
 */
export function safeHttpsUrl(value, hosts) {
  if (typeof value !== 'string' || value === '') {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !hosts.includes(url.hostname)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * @param {string} url
 */
export function assertBitbucketApiUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Refused: invalid API URL.');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.bitbucket.org') {
    throw new Error('Refused: requests are allowed only to api.bitbucket.org.');
  }
  if (!parsed.pathname.startsWith('/2.0/')) {
    throw new Error('Refused: only the Bitbucket Cloud REST API 2.0 is supported.');
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
