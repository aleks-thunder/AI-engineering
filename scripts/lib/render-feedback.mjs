const GENERATED_MARKER = '<!-- generated-by: import-review-feedback -->';

/**
 * @param {import('./comments.mjs').StoredComment[]} comments
 * @param {{
 *   id: number,
 *   title: string,
 *   state: string | null,
 *   url: string,
 *   author: { displayName: string | null, uuid: string },
 * }} pullRequest
 * @param {string} importedAt
 * @returns {string}
 */
export function renderFeedback(comments, pullRequest, importedAt) {
  const lines = [
    GENERATED_MARKER,
    '',
    `# PR ${pullRequest.id}: ${pullRequest.title || 'untitled'}`,
    '',
    `- State: ${pullRequest.state ?? 'not provided'}`,
    `- PR author: ${pullRequest.author.displayName ?? 'name not provided'} (${pullRequest.author.uuid || 'uuid not provided'})`,
    `- Link: ${pullRequest.url}`,
    `- Imported: ${importedAt}`,
    '',
    'Below is the original review history. A comment on its own is not treated as a defect: questions, suggestions and discussions are left unclassified.',
    '',
  ];

  const general = comments.filter((comment) => comment.kind === 'general');
  const byFile = new Map();
  for (const comment of comments) {
    if (comment.kind === 'general') {
      continue;
    }
    const path = comment.inline?.path ?? 'file not specified';
    const group = byFile.get(path) ?? [];
    group.push(comment);
    byFile.set(path, group);
  }

  lines.push('## General comments', '');
  if (general.length === 0) {
    lines.push('None.', '');
  } else {
    for (const comment of general) {
      lines.push(...renderComment(comment), '');
    }
  }

  for (const [path, group] of byFile) {
    lines.push(`## ${path}`, '');
    for (const comment of group) {
      lines.push(...renderComment(comment), '');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function isGeneratedFeedback(content) {
  return content.startsWith(GENERATED_MARKER);
}

/**
 * @param {import('./comments.mjs').StoredComment} comment
 * @returns {string[]}
 */
function renderComment(comment) {
  const location = comment.inline
    ? `lines from ${formatLine(comment.inline.from)} to ${formatLine(comment.inline.to)}`
    : 'not tied to a line';
  const parent = comment.parentId === null ? 'thread root' : `reply to #${comment.parentId}`;
  const flags = [
    comment.deleted === true ? 'deleted' : '',
    comment.pending === true ? 'draft' : '',
    comment.absentFromLatestCompleteImport ? 'absent from the latest complete import' : '',
  ].filter((flag) => flag !== '');
  const lines = [
    `### #${comment.id} · ${comment.authorRole} · ${comment.kind} · ${comment.author.displayName ?? (comment.author.uuid || 'author not provided')}`,
    '',
    `- When: ${comment.createdOn ?? 'not provided'}`,
    `- Where: ${location}`,
    `- Thread: ${parent}; status: ${comment.threadStatus}`,
    `- Link: ${comment.links.html ?? 'API did not provide an html link'}`,
  ];
  if (flags.length > 0) {
    lines.push(`- Flags: ${flags.join(', ')}`);
  }
  lines.push('', comment.contentRaw === '' ? 'No text provided.' : comment.contentRaw);
  return lines;
}

/**
 * @param {number | null} line
 * @returns {string}
 */
function lineLabel(line) {
  return line === null ? 'not provided' : String(line);
}

function formatLine(line) {
  return lineLabel(line);
}
