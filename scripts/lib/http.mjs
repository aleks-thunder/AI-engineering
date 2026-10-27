import { assertBitbucketApiUrl } from './identifiers.mjs';
import { redactSecrets } from './redact.mjs';

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;
const MAX_DELAY_MS = 30_000;

export class BitbucketApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status: number, accessDenied: boolean, retryable: boolean }} details
   */
  constructor(message, details) {
    super(message);
    this.name = 'BitbucketApiError';
    this.status = details.status;
    this.accessDenied = details.accessDenied;
    this.retryable = details.retryable;
  }
}

/**
 * @param {{
 *   token: string,
 *   auth: 'bearer' | 'basic',
 *   email: string,
 * }} auth
 * @returns {string}
 */
export function authorizationHeader(auth) {
  if (auth.auth === 'basic') {
    const encoded = Buffer.from(`${auth.email}:${auth.token}`, 'utf8').toString('base64');
    return `Basic ${encoded}`;
  }
  return `Bearer ${auth.token}`;
}

/**
 * @param {string} url
 * @param {{
 *   token: string,
 *   auth: 'bearer' | 'basic',
 *   email: string,
 *   fetchImpl: (url: string, init: { method: string, redirect: 'manual', headers: Record<string, string> }) => Promise<{
 *     status: number,
 *     ok: boolean,
 *     text: () => Promise<string>,
 *     headers?: { get: (name: string) => string | null },
 *   }>,
 *   sleep: (ms: number) => Promise<void>,
 * }} options
 * @returns {Promise<unknown>}
 */
export async function bitbucketGetJson(url, options) {
  assertBitbucketApiUrl(url);
  const secrets = [options.token, options.email].filter((value) => value.length > 0);
  /** @type {BitbucketApiError | null} */
  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    /** @type {{ status: number, ok: boolean, text: () => Promise<string>, headers?: { get: (name: string) => string | null } }} */
    let response;
    try {
      response = await options.fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          Accept: 'application/json',
          Authorization: authorizationHeader(options),
        },
      });
    } catch (error) {
      const message = redactSecrets(
        error instanceof Error ? error.message : 'Сетевая ошибка',
        secrets,
      );
      lastError = new BitbucketApiError(message, {
        status: 0,
        accessDenied: false,
        retryable: true,
      });
      if (attempt === MAX_ATTEMPTS - 1) {
        break;
      }
      await options.sleep(backoffMs(attempt));
      continue;
    }

    if (response.status >= 300 && response.status < 400) {
      throw new BitbucketApiError(
        `API вернул редирект (${response.status}). Запрос остановлен.`,
        { status: response.status, accessDenied: false, retryable: false },
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new BitbucketApiError(accessMessage(response.status), {
        status: response.status,
        accessDenied: true,
        retryable: false,
      });
    }

    if (RETRYABLE_STATUSES.has(response.status)) {
      const retryAfter = parseRetryAfter(response.headers?.get('retry-after') ?? null);
      lastError = new BitbucketApiError(`Временная ошибка API (${response.status}).`, {
        status: response.status,
        accessDenied: false,
        retryable: true,
      });
      if (attempt === MAX_ATTEMPTS - 1) {
        break;
      }
      await options.sleep(retryAfter ?? backoffMs(attempt));
      continue;
    }

    const text = await response.text();
    if (!response.ok) {
      const detail = extractErrorDetail(text, secrets);
      throw new BitbucketApiError(
        detail === '' ? `Ошибка API (${response.status}).` : `Ошибка API (${response.status}): ${detail}`,
        { status: response.status, accessDenied: false, retryable: false },
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new BitbucketApiError('Ответ API не является JSON.', {
        status: response.status,
        accessDenied: false,
        retryable: false,
      });
    }
  }

  throw lastError ?? new BitbucketApiError('Запрос к API не выполнен.', {
    status: 0,
    accessDenied: false,
    retryable: true,
  });
}

/**
 * @param {string} firstUrl
 * @param {{
 *   getJson: (url: string) => Promise<unknown>,
 *   maxPages: number,
 *   shouldStop?: (pages: unknown[][]) => boolean,
 * }} options
 * @returns {Promise<{ pages: unknown[][], complete: boolean }>}
 */
export async function collectPages(firstUrl, options) {
  /** @type {unknown[][]} */
  const pages = [];
  /** @type {string | null} */
  let url = firstUrl;
  const seen = new Set();

  while (url) {
    if (seen.has(url)) {
      throw new BitbucketApiError('Пагинация зациклилась. Загрузка остановлена.', {
        status: 0,
        accessDenied: false,
        retryable: false,
      });
    }
    seen.add(url);
    if (pages.length >= options.maxPages) {
      return { pages, complete: false };
    }

    assertBitbucketApiUrl(url);
    const payload = await options.getJson(url);
    if (!isPage(payload)) {
      throw new BitbucketApiError('Неполный ответ API: нет списка values.', {
        status: 0,
        accessDenied: false,
        retryable: false,
      });
    }
    pages.push(payload.values);
    if (options.shouldStop?.(pages)) {
      return { pages, complete: true };
    }
    url = typeof payload.next === 'string' && payload.next !== '' ? payload.next : null;
  }

  return { pages, complete: true };
}

/**
 * @param {number} attempt
 * @returns {number}
 */
function backoffMs(attempt) {
  return Math.min(1000 * 2 ** attempt, MAX_DELAY_MS);
}

/**
 * @param {string | null} value
 * @returns {number | null}
 */
function parseRetryAfter(value) {
  if (value == null || value === '') {
    return null;
  }
  if (/^\d+$/.test(value)) {
    return Math.min(Number(value) * 1000, MAX_DELAY_MS);
  }
  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) {
    return null;
  }
  return Math.min(Math.max(dateMs - Date.now(), 0), MAX_DELAY_MS);
}

/**
 * @param {number} status
 * @returns {string}
 */
function accessMessage(status) {
  if (status === 401) {
    return 'Доступ отклонён (401). Проверьте токен и срок его действия.';
  }
  return 'Недостаточно прав (403). Для чтения PR нужен scope read:pullrequest:bitbucket. Для --whoami нужен read:user:bitbucket.';
}

/**
 * @param {string} text
 * @param {readonly string[]} secrets
 * @returns {string}
 */
function extractErrorDetail(text, secrets) {
  try {
    const payload = JSON.parse(text);
    if (
      payload
      && typeof payload === 'object'
      && 'error' in payload
      && payload.error
      && typeof payload.error === 'object'
      && 'message' in payload.error
      && typeof payload.error.message === 'string'
    ) {
      return redactSecrets(payload.error.message, secrets).slice(0, 180);
    }
  } catch {
    return '';
  }
  return '';
}

/**
 * @param {unknown} value
 * @returns {value is { values: unknown[], next?: unknown }}
 */
function isPage(value) {
  return typeof value === 'object' && value !== null && 'values' in value && Array.isArray(value.values);
}
