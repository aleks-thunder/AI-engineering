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
    `# PR ${pullRequest.id}: ${pullRequest.title || 'без названия'}`,
    '',
    `- Состояние: ${pullRequest.state ?? 'не передано'}`,
    `- Автор PR: ${pullRequest.author.displayName ?? 'имя не передано'} (${pullRequest.author.uuid || 'uuid не передан'})`,
    `- Ссылка: ${pullRequest.url}`,
    `- Импорт: ${importedAt}`,
    '',
    'Ниже исходная история ревью. Комментарий сам по себе не считается ошибкой: вопросы, предложения и обсуждения оставлены без классификации.',
    '',
  ];

  const general = comments.filter((comment) => comment.kind === 'general');
  const byFile = new Map();
  for (const comment of comments) {
    if (comment.kind === 'general') {
      continue;
    }
    const path = comment.inline?.path ?? 'файл не указан';
    const group = byFile.get(path) ?? [];
    group.push(comment);
    byFile.set(path, group);
  }

  lines.push('## Общие комментарии', '');
  if (general.length === 0) {
    lines.push('Нет.', '');
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
    ? `строки from ${formatLine(comment.inline.from)} to ${formatLine(comment.inline.to)}`
    : 'без привязки к строке';
  const parent = comment.parentId === null ? 'корень треда' : `ответ на #${comment.parentId}`;
  const flags = [
    comment.deleted === true ? 'удалён' : '',
    comment.pending === true ? 'черновик' : '',
    comment.absentFromLatestCompleteImport ? 'не пришёл в последнем полном импорте' : '',
  ].filter((flag) => flag !== '');
  const lines = [
    `### #${comment.id} · ${comment.authorRole} · ${comment.kind} · ${comment.author.displayName ?? (comment.author.uuid || 'автор не передан')}`,
    '',
    `- Когда: ${comment.createdOn ?? 'не передано'}`,
    `- Где: ${location}`,
    `- Тред: ${parent}; статус: ${comment.threadStatus}`,
    `- Ссылка: ${comment.links.html ?? 'API не передал html-ссылку'}`,
  ];
  if (flags.length > 0) {
    lines.push(`- Отметки: ${flags.join(', ')}`);
  }
  lines.push('', comment.contentRaw === '' ? 'Текст не передан.' : comment.contentRaw);
  return lines;
}

/**
 * @param {number | null} line
 * @returns {string}
 */
function lineLabel(line) {
  return line === null ? 'не передана' : String(line);
}

function formatLine(line) {
  return lineLabel(line);
}
