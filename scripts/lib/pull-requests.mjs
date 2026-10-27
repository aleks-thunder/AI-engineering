import { isRecord, mapUser, matchesIdentity, optionalBoolean } from './identifiers.mjs';

export const DEFAULT_STATES = ['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED'];
export const SELECTION_STRATEGY = 'server-sort-updated_on-desc-then-paginate';

/**
 * @param {{
 *   workspace: string,
 *   repoSlug: string,
 *   states: readonly string[],
 *   authorUuid: string,
 *   pagelen: number,
 * }} query
 * @returns {URL}
 */
export function buildPullRequestsUrl(query) {
  const url = new URL(
    `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(query.workspace)}/${encodeURIComponent(query.repoSlug)}/pullrequests`,
  );
  url.searchParams.set('pagelen', String(query.pagelen));
  url.searchParams.set('sort', '-updated_on');
  for (const state of query.states) {
    url.searchParams.append('state', state);
  }
  if (query.authorUuid !== '') {
    url.searchParams.set('q', `author.uuid = "${query.authorUuid}"`);
  }
  return url;
}

/**
 * @param {readonly (readonly unknown[])[]} pages
 * @param {{
 *   author: import('./identifiers.mjs').Identity,
 *   limit: number | null,
 *   complete: boolean,
 * }} criteria
 * @returns {{ pullRequests: Record<string, unknown>[], complete: boolean }}
 */
export function selectPullRequestsFromPages(pages, criteria) {
  /** @type {Record<string, unknown>[]} */
  const selected = [];
  for (const page of pages) {
    for (const entry of page) {
      if (!isRecord(entry) || !matchesIdentity(entry.author, criteria.author)) {
        continue;
      }
      selected.push(entry);
      if (criteria.limit !== null && selected.length >= criteria.limit) {
        return { pullRequests: selected, complete: true };
      }
    }
  }
  return { pullRequests: selected, complete: criteria.complete };
}

/**
 * @param {unknown} pullRequest
 * @param {{ workspace: string, repoSlug: string }} repo
 * @returns {{
 *   id: number,
 *   title: string,
 *   state: string | null,
 *   createdOn: string | null,
 *   updatedOn: string | null,
 *   descriptionRaw: string | null,
 *   reasonRaw: string | null,
 *   sourceBranch: string | null,
 *   destinationBranch: string | null,
 *   url: string,
 *   apiUrl: string | null,
 *   reportedCommentCount: number | null,
 *   author: ReturnType<typeof mapUser>,
 *   reviewers: ReturnType<typeof mapParticipant>[],
 *   participants: ReturnType<typeof mapParticipant>[],
 * }}
 */
export function mapPullRequest(pullRequest, repo) {
  if (!isRecord(pullRequest) || typeof pullRequest.id !== 'number') {
    throw new Error('Ответ PR не содержит числовой id.');
  }
  const links = isRecord(pullRequest.links) ? pullRequest.links : {};
  const selfLink = isRecord(links.self) && typeof links.self.href === 'string' ? links.self.href : null;
  return {
    id: pullRequest.id,
    title: typeof pullRequest.title === 'string' ? pullRequest.title : '',
    state: typeof pullRequest.state === 'string' ? pullRequest.state : null,
    createdOn: typeof pullRequest.created_on === 'string' ? pullRequest.created_on : null,
    updatedOn: typeof pullRequest.updated_on === 'string' ? pullRequest.updated_on : null,
    descriptionRaw: rawText(pullRequest.summary) ?? (typeof pullRequest.description === 'string' ? pullRequest.description : null),
    reasonRaw: rawText(pullRequest.reason),
    sourceBranch: branchName(pullRequest.source),
    destinationBranch: branchName(pullRequest.destination),
    url: `https://bitbucket.org/${repo.workspace}/${repo.repoSlug}/pull-requests/${pullRequest.id}`,
    apiUrl: selfLink && selfLink.startsWith('https://api.bitbucket.org/') ? selfLink : null,
    reportedCommentCount: typeof pullRequest.comment_count === 'number' ? pullRequest.comment_count : null,
    author: mapUser(pullRequest.author),
    reviewers: mapPeople(pullRequest.reviewers),
    participants: mapPeople(pullRequest.participants),
  };
}

/**
 * @param {readonly unknown[]} events
 * @returns {{
 *   type: 'approval' | 'changes_requested' | 'state_change',
 *   date: string | null,
 *   state: string | null,
 *   user: ReturnType<typeof mapUser>,
 * }[]}
 */
export function summarizeActivity(events) {
  /** @type {ReturnType<typeof summarizeActivity>} */
  const reviewEvents = [];
  for (const event of events) {
    if (!isRecord(event)) {
      continue;
    }
    if (isRecord(event.approval)) {
      reviewEvents.push({
        type: 'approval',
        date: typeof event.approval.date === 'string' ? event.approval.date : null,
        state: null,
        user: mapUser(event.approval.user),
      });
      continue;
    }
    if (isRecord(event.changes_requested)) {
      reviewEvents.push({
        type: 'changes_requested',
        date: typeof event.changes_requested.date === 'string' ? event.changes_requested.date : null,
        state: null,
        user: mapUser(event.changes_requested.user),
      });
      continue;
    }
    if (isRecord(event.update) && typeof event.update.state === 'string') {
      reviewEvents.push({
        type: 'state_change',
        date: typeof event.update.date === 'string' ? event.update.date : null,
        state: event.update.state,
        user: mapUser(event.update.author),
      });
    }
  }
  return reviewEvents;
}

/**
 * @param {unknown} people
 * @returns {ReturnType<typeof mapParticipant>[]}
 */
function mapPeople(people) {
  if (!Array.isArray(people)) {
    return [];
  }
  return people.filter(isRecord).map(mapParticipant);
}

/**
 * @param {Record<string, unknown>} participant
 */
function mapParticipant(participant) {
  return {
    role: typeof participant.role === 'string' ? participant.role : null,
    approved: optionalBoolean(participant.approved),
    state: typeof participant.state === 'string' ? participant.state : null,
    participatedOn: typeof participant.participated_on === 'string' ? participant.participated_on : null,
    user: mapUser(participant.user),
  };
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function branchName(value) {
  if (!isRecord(value) || !isRecord(value.branch) || typeof value.branch.name !== 'string') {
    return null;
  }
  return value.branch.name;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function rawText(value) {
  if (!isRecord(value) || typeof value.raw !== 'string') {
    return null;
  }
  return value.raw;
}
