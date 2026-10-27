#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnvFile, parseCliArgs, parseLocalConfig, resolveSettings } from './lib/config.mjs';
import { bitbucketGetJson } from './lib/http.mjs';
import { parseBitbucketRemote } from './lib/identifiers.mjs';
import { runImport } from './lib/import-runner.mjs';
import { redactSecrets } from './lib/redact.mjs';

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inboxDir = path.join(workspaceRoot, 'inbox/review-feedback');
const envPath = path.join(workspaceRoot, '.env');
const configPath = path.join(workspaceRoot, 'config/review-feedback.local.json');

/**
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} env
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   sleep?: (ms: number) => Promise<void>,
 *   now?: () => string,
 *   gitRemoteUrl?: string | null,
 *   inboxDir?: string,
 * }} [dependencies]
 */
export async function runFromCli(argv, env, dependencies = {}) {
  let cli;
  try {
    cli = parseCliArgs(argv);
  } catch (error) {
    return {
      exitCode: 2,
      lines: [error instanceof Error ? error.message : 'Некорректные аргументы.'],
    };
  }

  const targetInbox = dependencies.inboxDir ?? inboxDir;
  if (cli.help || cli.list) {
    return runImport({
      cli,
      settings: null,
      inboxDir: targetInbox,
      client: null,
      now: dependencies.now,
    });
  }

  let fileEnv = {};
  try {
    fileEnv = await loadEnvFile(envPath);
  } catch (error) {
    return {
      exitCode: 2,
      lines: [error instanceof Error ? error.message : 'Не удалось прочитать .env.'],
    };
  }

  const token = env.BITBUCKET_API_TOKEN || fileEnv.BITBUCKET_API_TOKEN || '';
  if (token.length >= 8 && argv.some((argument) => argument.includes(token))) {
    return {
      exitCode: 2,
      lines: ['Токен передан в командной строке. Уберите его из аргументов и оставьте в окружении.'],
    };
  }

  /** @type {ReturnType<typeof parseLocalConfig> | null} */
  let localConfig = null;
  try {
    const raw = await readFile(configPath, 'utf8');
    localConfig = parseLocalConfig(JSON.parse(raw));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      const message = error instanceof SyntaxError
        ? 'review-feedback.local.json не является JSON.'
        : error instanceof Error
          ? error.message
          : 'Не удалось прочитать локальную конфигурацию.';
      return { exitCode: 2, lines: [redactSecrets(message, [token])] };
    }
  }

  let gitRemoteUrl = null;
  if (dependencies.gitRemoteUrl !== undefined) {
    gitRemoteUrl = dependencies.gitRemoteUrl;
  } else {
    gitRemoteUrl = await readBitbucketRemote(workspaceRoot);
  }

  let settings;
  try {
    settings = resolveSettings({ env, fileEnv, localConfig, gitRemoteUrl });
  } catch (error) {
    return {
      exitCode: 2,
      lines: [redactSecrets(error instanceof Error ? error.message : 'Ошибка конфигурации.', [token])],
    };
  }

  const secrets = [settings.token, settings.atlassianEmail].filter((value) => value.length > 0);
  const outcome = await runImport({
    cli,
    settings,
    inboxDir: targetInbox,
    now: dependencies.now,
    client: {
      getJson: (url) => bitbucketGetJson(url, {
        token: settings.token,
        auth: settings.auth,
        email: settings.atlassianEmail,
        fetchImpl: dependencies.fetchImpl ?? fetch,
        sleep: dependencies.sleep ?? ((ms) => new Promise((resolve) => {
          setTimeout(resolve, ms);
        })),
      }),
    },
  });

  return {
    exitCode: outcome.exitCode,
    lines: outcome.lines.map((line) => redactSecrets(line, secrets)),
    results: outcome.results,
  };
}

/**
 * @param {string} cwd
 * @returns {Promise<string | null>}
 */
async function readBitbucketRemote(cwd) {
  for (const remote of ['bitbucket', 'origin']) {
    try {
      const { stdout } = await execFileAsync('git', ['remote', 'get-url', remote], { cwd });
      if (parseBitbucketRemote(stdout)) {
        return stdout.trim();
      }
    } catch {
      continue;
    }
  }
  return null;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return import.meta.url === pathToFileURL(entry).href;
  }
}

if (invokedDirectly()) {
  runFromCli(process.argv.slice(2), process.env)
    .then((outcome) => {
      for (const line of outcome.lines) {
        console.log(line);
      }
      process.exitCode = outcome.exitCode;
    })
    .catch(() => {
      console.error('Импорт прерван.');
      process.exitCode = 1;
    });
}
