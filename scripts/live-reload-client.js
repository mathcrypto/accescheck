(() => {
  const version = new URL(document.currentScript.src).searchParams.get('v');
  let stream;
  let pending = false;
  const refresh = () => {
    if (!pending || location.pathname !== '/' || document.querySelector('dialog[open]')) return;
    const edited = [...document.querySelectorAll('input,select,textarea')].some((el) =>
      ['checkbox', 'radio'].includes(el.type) ? el.checked : Boolean(el.value),
    );
    if (!edited) location.reload();
  };
  const connect = () => {
    stream = new EventSource('/__dev/events');
    stream.onmessage = (event) => {
      if (event.data !== version) {
        pending = true;
        refresh();
      }
    };
  };
  connect();
  document.addEventListener('input', refresh);
  document.addEventListener('change', refresh);
  document.addEventListener('close', refresh, true);
  window.addEventListener('pagehide', () => stream.close());
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) connect();
  });
})();
