/**
 * @param {string} text
 * @param {readonly string[]} secrets
 * @returns {string}
 */
export function redactSecrets(text, secrets) {
  let output = text;
  for (const secret of secrets) {
    if (secret.length < 8) {
      continue;
    }
    output = output.split(secret).join('[redacted]');
  }
  return output
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/Basic\s+\S+/gi, 'Basic [redacted]');
}
