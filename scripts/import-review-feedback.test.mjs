import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { mapComment, mergeComments } from './lib/comments.mjs';
import { parseCliArgs, parseEnvFile, resolveMode, resolveSettings } from './lib/config.mjs';
import { BitbucketApiError, bitbucketGetJson, collectPages } from './lib/http.mjs';
import {
  matchesIdentity,
  normalizeUuid,
  parseBitbucketRemote,
  parsePullRequestRef,
} from './lib/identifiers.mjs';
import { runImport } from './lib/import-runner.mjs';
import { buildPullRequestsUrl, selectPullRequestsFromPages, summarizeActivity } from './lib/pull-requests.mjs';
import { redactSecrets } from './lib/redact.mjs';
import { isGeneratedFeedback, renderFeedback } from './lib/render-feedback.mjs';
import { mergeMetadata, savePullRequestBundle } from './lib/storage.mjs';
import { runFromCli } from './import-review-feedback.mjs';

const AUTHOR = '{11111111-1111-4111-8111-111111111111}';
const LEAD = '{22222222-2222-4222-8222-222222222222}';
const OTHER = '{33333333-3333-4333-8333-333333333333}';
const TOKEN = 'fixture-token-value-not-real';

const author = { uuid: AUTHOR, accountId: 'me-account' };
const techLead = { uuid: LEAD, accountId: 'lead-account' };

test('normalizes Bitbucket UUID and ignores display names', () => {
  assert.equal(normalizeUuid('  ABCDEFAB-1234-4234-8234-ABCDEFABCDEF  '), '{abcdefab-1234-4234-8234-abcdefabcdef}');
  assert.equal(normalizeUuid('Tech Lead'), '');
  assert.equal(matchesIdentity({ display_name: 'Tech Lead', uuid: OTHER }, techLead), false);
  assert.equal(matchesIdentity({ uuid: `{${LEAD.slice(1, -1).toUpperCase()}}`, account_id: 'lead-account' }, techLead), true);
});

test('reads the Bitbucket remote and a pull request URL', () => {
  assert.deepEqual(parseBitbucketRemote('git@bitbucket.org:lavinmedia/dashboard.git'), {
    workspace: 'lavinmedia',
    repoSlug: 'dashboard',
  });
  assert.equal(parseBitbucketRemote('git@github.com:lavinmedia/dashboard.git'), null);
  assert.deepEqual(
    parsePullRequestRef('https://bitbucket.org/lavinmedia/dashboard/pull-requests/589/diff'),
    { id: 589, workspace: 'lavinmedia', repoSlug: 'dashboard' },
  );
  assert.throws(() => parsePullRequestRef('https://example.com/lavinmedia/dashboard/pull-requests/1'));
});

test('builds a paginated author query sorted by update time', () => {
  const url = buildPullRequestsUrl({
    workspace: 'lavinmedia',
    repoSlug: 'dashboard',
    states: ['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED'],
    authorUuid: AUTHOR,
    pagelen: 50,
  });
  assert.equal(url.searchParams.get('sort'), '-updated_on');
  assert.equal(url.searchParams.get('pagelen'), '50');
  assert.deepEqual(url.searchParams.getAll('state'), ['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED']);
  assert.equal(url.searchParams.get('q'), `author.uuid = "${AUTHOR}"`);
});

test('selects the author across pages instead of trusting one response', () => {
  const mine = (id) => ({ id, author: { uuid: AUTHOR, account_id: 'me-account' }, title: `mine ${id}` });
  const foreign = { id: 99, author: { uuid: OTHER, account_id: 'other-account' }, title: 'foreign' };
  const selected = selectPullRequestsFromPages(
    [[foreign, mine(1)], [mine(2)], [mine(3)]],
    { author, limit: 2, complete: false },
  );
  assert.deepEqual(selected.pullRequests.map((pullRequest) => pullRequest.id), [1, 2]);
  assert.equal(selected.complete, true);

  const short = selectPullRequestsFromPages([[mine(1)]], { author, limit: 10, complete: false });
  assert.equal(short.pullRequests.length, 1);
  assert.equal(short.complete, false);
});

test('keeps questions unclassified and threads replies by parent id', () => {
  const identities = {
    pullRequestAuthor: author,
    configuredUser: author,
    techLead,
  };
  const leadComment = mapComment({
    id: 10,
    content: { raw: 'fixture: is this name clear?' },
    user: { uuid: LEAD, account_id: 'lead-account', display_name: 'Lead' },
    inline: { path: 'src/app.ts', from: null, to: 12 },
    created_on: '2026-01-01T00:00:00Z',
  }, identities);
  const reply = mapComment({
    id: 11,
    parent: { id: 10 },
    content: { raw: 'fixture reply' },
    user: { uuid: AUTHOR, account_id: 'me-account', display_name: 'Me' },
    resolution: null,
  }, identities);
  const openEnded = mapComment({
    id: 12,
    content: { raw: 'fixture suggestion' },
    user: { uuid: OTHER, display_name: 'Someone' },
    resolution: {},
  }, identities);

  assert.equal(leadComment.authorRole, 'tech_lead');
  assert.equal(leadComment.kind, 'inline');
  assert.equal(leadComment.threadStatus, 'unknown');
  assert.equal(leadComment.inline?.to, 12);
  assert.equal(Object.hasOwn(leadComment, 'verdict'), false);
  assert.equal(reply.kind, 'reply');
  assert.equal(reply.parentId, 10);
  assert.equal(reply.authorRole, 'pull_request_author');
  assert.equal(reply.threadStatus, 'open');
  assert.equal(openEnded.authorRole, 'other');
  assert.equal(openEnded.threadStatus, 'unknown');

  const resolved = mapComment({
    id: 13,
    content: { raw: 'fixture' },
    user: { uuid: LEAD },
    resolution: { created_on: '2026-01-02T00:00:00Z', user: { uuid: LEAD } },
  }, identities);
  assert.equal(resolved.threadStatus, 'resolved');
});

test('deduplicates by comment id and keeps comments missing from a later import', () => {
  const identities = { pullRequestAuthor: author, configuredUser: author, techLead };
  const first = mapComment({ id: 1, content: { raw: 'old' }, user: { uuid: LEAD } }, identities);
  const updated = mapComment({ id: 1, content: { raw: 'new' }, user: { uuid: LEAD } }, identities);
  const kept = mapComment({ id: 2, content: { raw: 'keep' }, user: { uuid: OTHER } }, identities);
  const merged = mergeComments([first, kept], [updated]);
  assert.deepEqual(merged.map((comment) => [comment.id, comment.contentRaw, comment.absentFromLatestCompleteImport]), [
    [1, 'new', false],
    [2, 'keep', true],
  ]);
});

test('retries a temporary API error and redacts the token', async () => {
  let calls = 0;
  /** @type {number[]} */
  const sleeps = [];
  const payload = await bitbucketGetJson('https://api.bitbucket.org/2.0/user', {
    token: TOKEN,
    auth: 'bearer',
    email: '',
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    fetchImpl: async (_url, init) => {
      calls += 1;
      assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
      if (calls === 1) {
        return { status: 429, ok: false, headers: { get: () => '0' }, text: async () => '' };
      }
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        text: async () => JSON.stringify({ uuid: AUTHOR, error: TOKEN }),
      };
    },
  });
  assert.equal(calls, 2);
  assert.equal(sleeps.length, 1);
  assert.equal(payload.uuid, AUTHOR);

  await assert.rejects(
    () => bitbucketGetJson('https://api.bitbucket.org/2.0/user', {
      token: TOKEN,
      auth: 'bearer',
      email: '',
      sleep: async () => {},
      fetchImpl: async () => ({
        status: 400,
        ok: false,
        headers: { get: () => null },
        text: async () => JSON.stringify({ error: { message: `bad ${TOKEN}` } }),
      }),
    }),
    (error) => {
      assert.ok(error instanceof BitbucketApiError);
      assert.equal(error.message.includes(TOKEN), false);
      assert.match(error.message, /\[redacted\]/);
      return true;
    },
  );

  await assert.rejects(
    () => bitbucketGetJson('https://api.bitbucket.org/2.0/user', {
      token: TOKEN,
      auth: 'bearer',
      email: '',
      sleep: async () => {},
      fetchImpl: async () => ({ status: 403, ok: false, headers: { get: () => null }, text: async () => TOKEN }),
    }),
    (error) => {
      assert.ok(error instanceof BitbucketApiError);
      assert.equal(error.accessDenied, true);
      assert.equal(error.message.includes(TOKEN), false);
      return true;
    },
  );
});

test('paginates until next is empty and reports a page cap', async () => {
  const seen = [];
  const collected = await collectPages('https://api.bitbucket.org/2.0/repositories/acme/app/pullrequests?page=1', {
    maxPages: 5,
    getJson: async (url) => {
      seen.push(url);
      if (url.endsWith('page=1')) {
        return { values: [{ id: 1 }], next: 'https://api.bitbucket.org/2.0/repositories/acme/app/pullrequests?page=2' };
      }
      return { values: [{ id: 2 }], next: null };
    },
  });
  assert.equal(collected.complete, true);
  assert.deepEqual(collected.pages.flat().map((entry) => entry.id), [1, 2]);

  const capped = await collectPages('https://api.bitbucket.org/2.0/repositories/acme/app/pullrequests?page=1', {
    maxPages: 1,
    getJson: async () => ({
      values: [{ id: 1 }],
      next: 'https://api.bitbucket.org/2.0/repositories/acme/app/pullrequests?page=2',
    }),
  });
  assert.equal(capped.complete, false);
  assert.equal(capped.pages.length, 1);
  assert.deepEqual(seen, [
    'https://api.bitbucket.org/2.0/repositories/acme/app/pullrequests?page=1',
    'https://api.bitbucket.org/2.0/repositories/acme/app/pullrequests?page=2',
  ]);
});

test('preserves manual notes and a hand-edited feedback file', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'review-feedback-'));
  const pullRequest = { id: 5, title: 'Readable title', state: 'OPEN', url: 'https://bitbucket.org/acme/app/pull-requests/5', author: { displayName: 'Me', uuid: AUTHOR } };
  const comment = mapComment({
    id: 1,
    content: { raw: 'fixture comment' },
    user: { uuid: LEAD, display_name: 'Lead' },
  }, { pullRequestAuthor: author, configuredUser: author, techLead });
  const feedback = renderFeedback([comment], pullRequest, '2026-01-01T00:00:00.000Z');
  assert.equal(isGeneratedFeedback(feedback), true);

  await savePullRequestBundle({
    inboxDir: root,
    pullRequest,
    metadata: { schemaVersion: 1, pullRequest, import: { status: 'complete' } },
    commentsDocument: { comments: [comment] },
    feedback,
  });
  const directory = path.join(root, 'PR-5-readable-title');
  const metadata = JSON.parse(await readFile(path.join(directory, 'metadata.json'), 'utf8'));
  metadata.notes = 'manual note';
  await writeFile(path.join(directory, 'metadata.json'), JSON.stringify(metadata), 'utf8');
  await writeFile(path.join(directory, 'context.md'), 'my context\n', 'utf8');
  await writeFile(path.join(directory, 'feedback.md'), 'hand edited\n', 'utf8');

  const saved = await savePullRequestBundle({
    inboxDir: root,
    pullRequest: { ...pullRequest, title: 'Changed title' },
    metadata: { schemaVersion: 1, pullRequest: { ...pullRequest, title: 'Changed title' }, import: { status: 'complete' } },
    commentsDocument: { comments: [comment] },
    feedback: renderFeedback([comment], pullRequest, '2026-01-02T00:00:00.000Z'),
  });
  assert.equal(saved.contextPreserved, true);
  assert.equal(saved.feedbackStatus, 'preserved');
  assert.equal(await readFile(path.join(directory, 'context.md'), 'utf8'), 'my context\n');
  assert.equal(await readFile(path.join(directory, 'feedback.md'), 'utf8'), 'hand edited\n');
  const rewritten = JSON.parse(await readFile(path.join(directory, 'metadata.json'), 'utf8'));
  assert.equal(rewritten.notes, 'manual note');
  assert.equal(rewritten.pullRequest.title, 'Changed title');
  assert.equal(mergeMetadata({ notes: 'keep', custom: true }, { import: { status: 'failed' } }).notes, 'keep');
});

test('imports, refreshes, and keeps prior comments when access fails', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'review-import-'));
  const settings = settingsFor('bearer');
  /** @type {Map<number, { id: number, content: { raw: string }, user: { uuid: string, account_id: string, display_name: string }, parent?: { id: number }, inline?: { path: string, to: number }, resolution?: unknown }>} */
  const comments = new Map([
    [10, { id: 10, content: { raw: 'fixture: please rename' }, user: user(LEAD, 'Lead'), inline: { path: 'a.ts', to: 4 } }],
    [11, { id: 11, content: { raw: 'fixture reply' }, user: user(AUTHOR, 'Me'), parent: { id: 10 } }],
    [12, { id: 12, content: { raw: 'fixture question' }, user: user(OTHER, 'Other') }],
  ]);
  const calls = [];
  const client = clientFor(settings, comments, calls);

  const first = await runImport({
    cli: parseCliArgs(['--limit', '10']),
    settings,
    inboxDir: root,
    client,
    now: () => '2026-01-01T00:00:00.000Z',
  });
  assert.equal(first.exitCode, 0);
  assert.equal(first.results[0].commentCount, 3);
  assert.equal(first.results[0].techLeadCommentCount, 1);
  assert.equal(calls.some((url) => url.includes('/pullrequests/99')), false);

  const directory = path.join(root, first.results[0].directoryName ?? '');
  const metadata = JSON.parse(await readFile(path.join(directory, 'metadata.json'), 'utf8'));
  metadata.notes = 'do not lose';
  await writeFile(path.join(directory, 'metadata.json'), JSON.stringify(metadata), 'utf8');
  await writeFile(path.join(directory, 'context.md'), 'context stays\n', 'utf8');
  const stored = JSON.parse(await readFile(path.join(directory, 'comments.json'), 'utf8'));
  assert.equal(stored.comments.find((comment) => comment.id === 11).kind, 'reply');
  assert.equal(stored.comments.find((comment) => comment.id === 12).threadStatus, 'unknown');

  comments.delete(12);
  comments.set(10, { ...comments.get(10), content: { raw: 'fixture: please rename updated' } });
  const refreshed = await runImport({
    cli: parseCliArgs(['--refresh']),
    settings,
    inboxDir: root,
    client,
    now: () => '2026-01-02T00:00:00.000Z',
  });
  assert.equal(refreshed.exitCode, 0);
  assert.match(refreshed.lines.join('\n'), /comment_count=3/);
  const afterRefresh = JSON.parse(await readFile(path.join(directory, 'comments.json'), 'utf8'));
  const byId = Object.fromEntries(afterRefresh.comments.map((comment) => [comment.id, comment]));
  assert.equal(byId[10].contentRaw, 'fixture: please rename updated');
  assert.equal(byId[12].absentFromLatestCompleteImport, true);
  assert.equal(afterRefresh.comments.length, 3);
  const metadataAfter = JSON.parse(await readFile(path.join(directory, 'metadata.json'), 'utf8'));
  assert.equal(metadataAfter.notes, 'do not lose');
  assert.equal(await readFile(path.join(directory, 'context.md'), 'utf8'), 'context stays\n');
  assert.equal(metadataAfter.pullRequest.reviewEvents[0].type, 'approval');

  const denied = await runImport({
    cli: parseCliArgs(['--refresh']),
    settings,
    inboxDir: root,
    client: {
      getJson: async () => {
        throw new BitbucketApiError('Недостаточно прав (403).', { status: 403, accessDenied: true, retryable: false });
      },
    },
    now: () => '2026-01-03T00:00:00.000Z',
  });
  assert.equal(denied.exitCode, 1);
  assert.match(denied.lines.join('\n'), /403/);
  const afterDenial = JSON.parse(await readFile(path.join(directory, 'comments.json'), 'utf8'));
  assert.equal(afterDenial.comments.length, 3);
  assert.equal(await readFile(path.join(directory, 'context.md'), 'utf8'), 'context stays\n');
  assert.equal(JSON.stringify(afterDenial).includes(TOKEN), false);
  assert.equal(denied.lines.join('\n').includes(TOKEN), false);
});

test('does not print a token when the API error contains it', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'review-cli-'));
  const outcome = await runFromCli(['--limit', '1'], { BITBUCKET_API_TOKEN: TOKEN }, {
    inboxDir: root,
    gitRemoteUrl: 'git@bitbucket.org:lavinmedia/dashboard.git',
    sleep: async () => {},
    fetchImpl: async () => ({
      status: 400,
      ok: false,
      headers: { get: () => null },
      text: async () => JSON.stringify({ error: { message: TOKEN } }),
    }),
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.lines.join('\n').includes(TOKEN), false);
  assert.match(outcome.lines.join('\n'), /\[redacted\]/);
});

test('does not replace saved comments when comment pagination stops early', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'review-partial-'));
  const settings = settingsFor('bearer');
  const savedComment = {
    id: 7,
    content: { raw: 'fixture kept' },
    user: user(LEAD, 'Lead'),
  };
  await runImport({
    cli: parseCliArgs(['--pr', '7']),
    settings,
    inboxDir: root,
    now: () => '2026-01-01T00:00:00.000Z',
    client: {
      async getJson(url) {
        if (url.endsWith('/comments?pagelen=100')) {
          return { values: [savedComment], next: null };
        }
        if (url.endsWith('/activity?pagelen=50')) {
          return { values: [], next: null };
        }
        return pullRequest(7, AUTHOR);
      },
    },
  });

  const partial = await runImport({
    cli: parseCliArgs(['--pr', '7', '--max-pages', '1']),
    settings,
    inboxDir: root,
    now: () => '2026-01-02T00:00:00.000Z',
    client: {
      async getJson(url) {
        if (url.includes('/comments')) {
          return { values: [{ id: 8, content: { raw: 'fixture new' }, user: user(LEAD, 'Lead') }], next: 'https://api.bitbucket.org/2.0/repositories/lavinmedia/dashboard/pullrequests/7/comments?page=2' };
        }
        return pullRequest(7, AUTHOR);
      },
    },
  });
  assert.equal(partial.exitCode, 1);
  assert.match(partial.lines.join('\n'), /не заменён/);
  const directory = path.join(root, 'PR-7-fixture-7');
  const comments = JSON.parse(await readFile(path.join(directory, 'comments.json'), 'utf8'));
  assert.deepEqual(comments.comments.map((comment) => comment.id), [7]);
  assert.equal(await readFile(path.join(directory, 'context.md'), 'utf8') !== '', true);
});

test('summarizes review activity without treating it as a comment verdict', () => {
  const events = summarizeActivity([
    { approval: { date: '2026-01-01T00:00:00Z', user: { uuid: LEAD, display_name: 'Lead' } } },
    { comment: { id: 1, content: { raw: 'not an event' } } },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'approval');
  assert.equal(events[0].user.uuid, LEAD);
});

test('rejects a token argument and resolves local settings from the git remote', () => {
  assert.throws(() => parseCliArgs(['--token', TOKEN]), /BITBUCKET_API_TOKEN/);
  const mode = resolveMode(parseCliArgs([]));
  assert.equal(mode.mode, 'recent');
  assert.equal(mode.limit, 10);
  assert.deepEqual(mode.states, ['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED']);
  assert.equal(resolveMode(parseCliArgs(['--completed', '--all'])).states[0], 'MERGED');
  const settings = resolveSettings({
    env: { BITBUCKET_API_TOKEN: TOKEN },
    fileEnv: parseEnvFile('BITBUCKET_TECH_LEAD_UUID={22222222-2222-4222-8222-222222222222}\n'),
    localConfig: null,
    gitRemoteUrl: 'git@bitbucket.org:lavinmedia/dashboard.git',
  });
  assert.equal(settings.workspace, 'lavinmedia');
  assert.equal(settings.repoSlug, 'dashboard');
  assert.equal(settings.techLead.uuid, '{22222222-2222-4222-8222-222222222222}');
  assert.equal(settings.token, TOKEN);
});

test('help and workspace gitignore keep imported review data local', async () => {
  const script = fileURLToPath(new URL('./import-review-feedback.mjs', import.meta.url));
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--refresh/);
  assert.equal(help.stdout.includes(TOKEN), false);
  assert.equal(help.stdout.includes('ai-engineering/'), false);

  const workspaceRoot = path.resolve(path.dirname(script), '..');
  const ignoreRules = (await readFile(path.join(workspaceRoot, '.gitignore'), 'utf8'))
    .split('\n')
    .map((line) => line.trim());
  for (const rule of [
    '.env',
    'config/review-feedback.local.json',
    'inbox/review-feedback/*/',
    'inbox/review-feedback/last-import-report.json',
    'data/*.jsonl',
  ]) {
    assert.equal(ignoreRules.includes(rule), true, `missing ignore rule: ${rule}`);
  }
});

/**
 * @param {'bearer' | 'basic'} auth
 */
function settingsFor(auth) {
  return {
    token: TOKEN,
    auth,
    atlassianEmail: '',
    workspace: 'lavinmedia',
    repoSlug: 'dashboard',
    author,
    techLead,
  };
}

/**
 * @param {string} uuid
 * @param {string} displayName
 */
function user(uuid, displayName) {
  const accountId = uuid === AUTHOR ? 'me-account' : uuid === LEAD ? 'lead-account' : 'other-account';
  return { uuid, account_id: accountId, display_name: displayName };
}

/**
 * @param {ReturnType<typeof settingsFor>} settings
 * @param {Map<number, { id: number }>} comments
 * @param {string[]} calls
 */
function clientFor(settings, comments, calls) {
  return {
    /**
     * @param {string} url
     */
    async getJson(url) {
      calls.push(url);
      const listPrefix = `https://api.bitbucket.org/2.0/repositories/${settings.workspace}/${settings.repoSlug}/pullrequests?`;
      if (url.startsWith(listPrefix)) {
        if (url.includes('page=2')) {
          return { values: [pullRequest(2, AUTHOR)], next: null };
        }
        return {
          values: [pullRequest(99, OTHER), pullRequest(1, AUTHOR)],
          next: 'https://api.bitbucket.org/2.0/repositories/lavinmedia/dashboard/pullrequests?page=2',
        };
      }
      const commentMatch = /\/pullrequests\/(\d+)\/comments/.exec(url);
      if (commentMatch) {
        return { values: [...comments.values()], next: null };
      }
      const activityMatch = /\/pullrequests\/(\d+)\/activity/.exec(url);
      if (activityMatch) {
        return {
          values: [{ approval: { date: '2026-01-01T00:00:00Z', user: user(LEAD, 'Lead') } }],
          next: null,
        };
      }
      const pullMatch = /\/pullrequests\/(\d+)$/.exec(url);
      if (pullMatch) {
        return pullRequest(Number(pullMatch[1]), AUTHOR);
      }
      throw new Error('unexpected url');
    },
  };
}

/**
 * @param {number} id
 * @param {string} uuid
 */
function pullRequest(id, uuid) {
  return {
    id,
    title: `Fixture ${id}`,
    state: 'MERGED',
    created_on: '2026-01-01T00:00:00Z',
    updated_on: '2026-01-02T00:00:00Z',
    comment_count: 3,
    author: user(uuid, uuid === AUTHOR ? 'Me' : 'Other'),
    source: { branch: { name: 'feature' } },
    destination: { branch: { name: 'master' } },
    participants: [{
      role: 'REVIEWER',
      approved: true,
      state: 'approved',
      user: user(LEAD, 'Lead'),
    }],
    links: { html: { href: `https://bitbucket.org/lavinmedia/dashboard/pull-requests/${id}` } },
  };
}
