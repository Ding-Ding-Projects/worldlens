/** Renderer authentication belongs in memory, never in capture receipts or logs. */
export function publicRendererUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '[unsupported renderer URL]';
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return '[invalid renderer URL]';
  }
}
