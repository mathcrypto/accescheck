// Native stream consumption: https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams
export async function readChatResponse(response, onEvent) {
  if (!response.headers.get('content-type')?.includes('application/x-ndjson')) {
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Service indisponible. Réessayez.');
    return value;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '',
    result = null;
  const consume = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.message || 'Recherche interrompue.');
    if (event.type === 'result') result = event.value;
    else if (['status', 'reply'].includes(event.type)) onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      if (pending.length > 1000000) throw new Error('Réponse trop volumineuse.');
      let end;
      while ((end = pending.indexOf('\n')) !== -1) {
        consume(pending.slice(0, end));
        pending = pending.slice(end + 1);
      }
      if (done) break;
    }
    consume(pending);
    if (!result) throw new Error('Réponse interrompue. Réessayez votre demande.');
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
