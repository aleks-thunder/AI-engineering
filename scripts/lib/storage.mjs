import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isRecord, pullRequestDirectoryName } from './identifiers.mjs';
import { isGeneratedFeedback } from './render-feedback.mjs';

const CONTEXT_TEMPLATE = `# PR context

This file is for your notes. Re-importing does not overwrite it.

- Task:
- What matters when analyzing the review:
`;

/**
 * @param {string} inboxDir
 * @param {number} pullRequestId
 * @returns {Promise<string[]>}
 */
export async function findExistingPullRequestDirs(inboxDir, pullRequestId) {
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = await readdir(inboxDir, { withFileTypes: true });
  } catch (error) {
    if (isErrno(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  /** @type {string[]} */
  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = path.join(inboxDir, entry.name);
    const metadata = await readJson(path.join(directory, 'metadata.json'));
    const metadataId = isRecord(metadata) && isRecord(metadata.pullRequest)
      ? metadata.pullRequest.id
      : null;
    const nameId = directoryPullRequestId(entry.name);
    if (metadataId === pullRequestId || (metadataId == null && nameId === pullRequestId)) {
      matches.push(directory);
    }
  }
  return matches;
}

/**
 * @param {string} inboxDir
 * @returns {Promise<{ id: number, title: string, directory: string, status: string | null, commentCount: number | null }[]>}
 */
export async function listSavedPullRequests(inboxDir) {
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = await readdir(inboxDir, { withFileTypes: true });
  } catch (error) {
    if (isErrno(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  /** @type {Awaited<ReturnType<typeof listSavedPullRequests>>} */
  const saved = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = path.join(inboxDir, entry.name);
    const metadata = await readJson(path.join(directory, 'metadata.json'));
    if (!isRecord(metadata) || !isRecord(metadata.pullRequest) || typeof metadata.pullRequest.id !== 'number') {
      continue;
    }
    const importInfo = isRecord(metadata.import) ? metadata.import : {};
    saved.push({
      id: metadata.pullRequest.id,
      title: typeof metadata.pullRequest.title === 'string' ? metadata.pullRequest.title : '',
      directory,
      status: typeof importInfo.status === 'string' ? importInfo.status : null,
      commentCount: typeof importInfo.commentCount === 'number' ? importInfo.commentCount : null,
    });
  }
  saved.sort((left, right) => left.id - right.id);
  return saved;
}

/**
 * @param {{
 *   inboxDir: string,
 *   pullRequest: { id: number, title: string },
 *   metadata: Record<string, unknown>,
 *   commentsDocument: Record<string, unknown> | null,
 *   feedback: string | null,
 * }} bundle
 * @returns {Promise<{ directory: string, contextPreserved: boolean, feedbackStatus: 'written' | 'preserved' | 'skipped' }>}
 */
export async function savePullRequestBundle(bundle) {
  const matches = await findExistingPullRequestDirs(bundle.inboxDir, bundle.pullRequest.id);
  if (matches.length > 1) {
    throw new Error(`Found several folders for PR ${bundle.pullRequest.id}. Write stopped to avoid creating a duplicate.`);
  }

  const directory = matches[0]
    ?? path.join(bundle.inboxDir, pullRequestDirectoryName(bundle.pullRequest.id, bundle.pullRequest.title));
  await mkdir(directory, { recursive: true });

  const feedbackPath = path.join(directory, 'feedback.md');
  let feedbackStatus = /** @type {'written' | 'preserved' | 'skipped'} */ ('skipped');
  if (bundle.feedback !== null) {
    const currentFeedback = await readText(feedbackPath);
    feedbackStatus = currentFeedback === null || isGeneratedFeedback(currentFeedback) ? 'written' : 'preserved';
  }

  const metadataPath = path.join(directory, 'metadata.json');
  const existingMetadata = await readJson(metadataPath);
  const metadata = mergeMetadata(existingMetadata, bundle.metadata);
  if (feedbackStatus === 'preserved' && isRecord(metadata.import) && Array.isArray(metadata.import.warnings)) {
    metadata.import.warnings = [
      ...metadata.import.warnings,
      'feedback.md was not overwritten: it has no generator marker. Notes were left as they are.',
    ];
  }
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  if (bundle.commentsDocument) {
    await writeFile(
      path.join(directory, 'comments.json'),
      `${JSON.stringify(bundle.commentsDocument, null, 2)}\n`,
      'utf8',
    );
  }

  const contextPath = path.join(directory, 'context.md');
  let contextPreserved = true;
  try {
    await writeFile(contextPath, CONTEXT_TEMPLATE, { encoding: 'utf8', flag: 'wx' });
    contextPreserved = false;
  } catch (error) {
    if (!isErrno(error) || error.code !== 'EEXIST') {
      throw error;
    }
  }

  if (feedbackStatus === 'written' && bundle.feedback !== null) {
    await writeFile(feedbackPath, bundle.feedback, 'utf8');
  }

  return { directory, contextPreserved, feedbackStatus };
}

/**
 * @param {string} inboxDir
 * @param {Record<string, unknown>} report
 */
export async function writeImportReport(inboxDir, report) {
  await mkdir(inboxDir, { recursive: true });
  await writeFile(
    path.join(inboxDir, 'last-import-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

/**
 * @param {unknown} existing
 * @param {Record<string, unknown>} incoming
 * @returns {Record<string, unknown>}
 */
export function mergeMetadata(existing, incoming) {
  const base = isRecord(existing) ? { ...existing } : {};
  const notes = Object.prototype.hasOwnProperty.call(base, 'notes') ? base.notes : '';
  return {
    ...base,
    ...incoming,
    notes,
  };
}

/**
 * @param {string} filePath
 * @returns {Promise<unknown>}
 */
export async function readJson(filePath) {
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (isErrno(error) && error.code === 'ENOENT') {
      return null;
    }
    if (error instanceof SyntaxError) {
      throw new Error(`${path.basename(filePath)} is corrupted. The file was not overwritten automatically.`);
    }
    throw error;
  }
}

/**
 * @param {string} name
 * @returns {number | null}
 */
function directoryPullRequestId(name) {
  const match = /^PR-(\d+)(?:-|$)/.exec(name);
  return match ? Number(match[1]) : null;
}

/**
 * @param {string} filePath
 * @returns {Promise<string | null>}
 */
async function readText(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (isErrno(error) && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * @param {unknown} error
 * @returns {error is NodeJS.ErrnoException}
 */
function isErrno(error) {
  return error instanceof Error && 'code' in error;
}
