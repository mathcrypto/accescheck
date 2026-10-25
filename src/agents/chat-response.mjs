import { runSearchAgent } from './search-agent.mjs';
import { chatInput } from './search-contract.mjs';

export function chatResponse(body, env, requestSignal) {
  chatInput(body);
  const abort = new AbortController();
  const signal = requestSignal ? AbortSignal.any([requestSignal, abort.signal]) : abort.signal;
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event) => {
        if (!signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };
      try {
        const value = await runSearchAgent(body, env, fetch, { signal, emit });
        signal.throwIfAborted();
        if (value.summary && !value.question)
          emit({ type: 'reply', delta: value.summary + '\n\n' });
        emit({ type: 'reply', delta: value.reply });
        emit({ type: 'result', value });
      } catch (error) {
        if (!signal.aborted) emit({ type: 'error', message: error.message });
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Accel-Buffering': 'no',
    },
  });
}
