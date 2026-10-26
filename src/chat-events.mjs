import { getTranslator } from './i18n-core.mjs';

// Native stream consumption: https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams
export async function readChatResponse(response, onEvent, language = 'fr') {
  const t = getTranslator(language);
  if (!response.headers.get('content-type')?.includes('application/x-ndjson')) {
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || t('search.errors.service'));
    return value;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '',
    result = null;
  const consume = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.message || t('search.errors.streamStopped'));
    if (event.type === 'result') result = event.value;
    else if (['status', 'reply'].includes(event.type)) onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      if (pending.length > 1000000) throw new Error(t('search.errors.responseSize'));
      let end;
      while ((end = pending.indexOf('\n')) !== -1) {
        consume(pending.slice(0, end));
        pending = pending.slice(end + 1);
      }
      if (done) break;
    }
    consume(pending);
    if (!result) throw new Error(t('search.errors.streamIncomplete'));
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
