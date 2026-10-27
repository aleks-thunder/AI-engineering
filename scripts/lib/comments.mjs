import {
  isRecord,
  mapUser,
  matchesIdentity,
  optionalBoolean,
  optionalInteger,
  safeHttpsUrl,
} from './identifiers.mjs';

/**
 * @typedef {'tech_lead' | 'pull_request_author' | 'other'} AuthorRole
 * @typedef {'reply' | 'inline' | 'general'} CommentKind
 * @typedef {'resolved' | 'open' | 'unknown'} ThreadStatus
 */

/**
 * @typedef {Object} StoredResolution
 * @property {string | null} createdOn
 * @property {string} userUuid
 */

/**
 * @typedef {Object} StoredInline
 * @property {string | null} path
 * @property {number | null} from
 * @property {number | null} to
 * @property {number | null} startFrom
 * @property {number | null} startTo
 */

/**
 * @typedef {Object} StoredComment
 * @property {number} id
 * @property {number | null} parentId
 * @property {CommentKind} kind
 * @property {string | null} createdOn
 * @property {string | null} updatedOn
 * @property {boolean | null} deleted
 * @property {boolean | null} pending
 * @property {ThreadStatus} threadStatus
 * @property {boolean} resolutionPresent
 * @property {StoredResolution | null} resolution
 * @property {AuthorRole} authorRole
 * @property {boolean} isConfiguredUser
 * @property {ReturnType<typeof mapUser>} author
 * @property {string} contentRaw
 * @property {StoredInline | null} inline
 * @property {{ html: string | null, self: string | null, code: string | null }} links
 * @property {boolean} absentFromLatestCompleteImport
 */

/**
 * @param {unknown} comment
 * @param {{
 *   pullRequestAuthor: import('./identifiers.mjs').Identity,
 *   configuredUser: import('./identifiers.mjs').Identity,
 *   techLead: import('./identifiers.mjs').Identity,
 * }} identities
 * @returns {StoredComment}
 */
export function mapComment(comment, identities) {
  if (!isRecord(comment) || typeof comment.id !== 'number' || !Number.isInteger(comment.id)) {
    throw new Error('Комментарий без стабильного числового id пропущен как неполный.');
  }

  const parentId = isRecord(comment.parent) ? optionalInteger(comment.parent.id) : null;
  const inline = mapInline(comment.inline);
  const author = mapUser(comment.user);
  const resolution = mapResolution(comment);
  const content = isRecord(comment.content) && typeof comment.content.raw === 'string'
    ? comment.content.raw
    : '';

  return {
    id: comment.id,
    parentId,
    kind: parentId !== null ? 'reply' : inline ? 'inline' : 'general',
    createdOn: typeof comment.created_on === 'string' ? comment.created_on : null,
    updatedOn: typeof comment.updated_on === 'string' ? comment.updated_on : null,
    deleted: optionalBoolean(comment.deleted),
    pending: optionalBoolean(comment.pending),
    threadStatus: resolution.threadStatus,
    resolutionPresent: resolution.resolutionPresent,
    resolution: resolution.resolution,
    authorRole: authorRole(comment.user, identities),
    isConfiguredUser: matchesIdentity(comment.user, identities.configuredUser),
    author,
    contentRaw: content,
    inline,
    links: mapLinks(comment.links),
    absentFromLatestCompleteImport: false,
  };
}

/**
 * @param {readonly StoredComment[]} existing
 * @param {readonly StoredComment[]} incoming
 * @returns {StoredComment[]}
 */
export function mergeComments(existing, incoming) {
  /** @type {Map<number, StoredComment>} */
  const byId = new Map();
  for (const comment of existing) {
    byId.set(comment.id, comment);
  }
  const incomingIds = new Set();
  for (const comment of incoming) {
    incomingIds.add(comment.id);
    const previous = byId.get(comment.id);
    byId.set(comment.id, {
      ...(previous ?? {}),
      ...comment,
      absentFromLatestCompleteImport: false,
    });
  }
  for (const [id, comment] of byId) {
    if (!incomingIds.has(id)) {
      byId.set(id, { ...comment, absentFromLatestCompleteImport: true });
    }
  }
  return [...byId.values()].sort((left, right) => left.id - right.id);
}

/**
 * @param {unknown} user
 * @param {{
 *   pullRequestAuthor: import('./identifiers.mjs').Identity,
 *   techLead: import('./identifiers.mjs').Identity,
 * }} identities
 * @returns {AuthorRole}
 */
export function authorRole(user, identities) {
  const techLeadConfigured = identities.techLead.uuid !== '' || identities.techLead.accountId !== '';
  if (techLeadConfigured && matchesIdentity(user, identities.techLead)) {
    return 'tech_lead';
  }
  if (matchesIdentity(user, identities.pullRequestAuthor)) {
    return 'pull_request_author';
  }
  return 'other';
}

/**
 * @param {Record<string, unknown>} comment
 * @returns {{ threadStatus: ThreadStatus, resolutionPresent: boolean, resolution: StoredResolution | null }}
 */
function mapResolution(comment) {
  if (!Object.prototype.hasOwnProperty.call(comment, 'resolution')) {
    return { threadStatus: 'unknown', resolutionPresent: false, resolution: null };
  }
  if (comment.resolution == null) {
    return { threadStatus: 'open', resolutionPresent: true, resolution: null };
  }
  if (!isRecord(comment.resolution)) {
    return { threadStatus: 'unknown', resolutionPresent: true, resolution: null };
  }
  const createdOn = typeof comment.resolution.created_on === 'string'
    ? comment.resolution.created_on
    : null;
  const userUuid = mapUser(comment.resolution.user).uuid;
  if (createdOn || userUuid) {
    return {
      threadStatus: 'resolved',
      resolutionPresent: true,
      resolution: { createdOn, userUuid },
    };
  }
  return {
    threadStatus: 'unknown',
    resolutionPresent: true,
    resolution: { createdOn: null, userUuid: '' },
  };
}

/**
 * @param {unknown} inline
 * @returns {StoredInline | null}
 */
function mapInline(inline) {
  if (!isRecord(inline)) {
    return null;
  }
  return {
    path: typeof inline.path === 'string' ? inline.path : null,
    from: optionalInteger(inline.from),
    to: optionalInteger(inline.to),
    startFrom: optionalInteger(inline.start_from),
    startTo: optionalInteger(inline.start_to),
  };
}

/**
 * @param {unknown} links
 * @returns {{ html: string | null, self: string | null, code: string | null }}
 */
function mapLinks(links) {
  const record = isRecord(links) ? links : {};
  return {
    html: href(record.html, ['bitbucket.org']),
    self: href(record.self, ['api.bitbucket.org']),
    code: href(record.code, ['bitbucket.org', 'api.bitbucket.org']),
  };
}

/**
 * @param {unknown} value
 * @param {readonly string[]} hosts
 * @returns {string | null}
 */
function href(value, hosts) {
  if (!isRecord(value)) {
    return null;
  }
  return safeHttpsUrl(value.href, hosts);
}
