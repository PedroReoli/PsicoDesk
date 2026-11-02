export function normalizeApiUrl(value: unknown, allowInsecureDevelopment = false) {
  if (typeof value !== 'string' || value.length > 2_048) return '';
  try {
    const url = new URL(value.trim());
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' && !(allowInsecureDevelopment && url.protocol === 'http:'))
    )
      return '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function isSafeApiPath(path: string) {
  return (
    path.startsWith('/') && !path.startsWith('//') && !path.includes('://') && !path.includes('\\')
  );
}
