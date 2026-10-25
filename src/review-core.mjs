export function safeReviewUrl(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !url.hostname.includes('.') ||
      /^[\d.]+$/.test(url.hostname) ||
      !/^[a-z0-9.-]+$/.test(url.hostname) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)
    )
      return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
      if (/^utm_|^(?:fbclid|gclid)$/.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch {
    return null;
  }
}
export const reviewSite = (url) => new URL(url).hostname.split('.').slice(-2).join('.');
