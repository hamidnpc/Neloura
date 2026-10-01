// static/workers/json_parse_worker.js
// Simple JSON parse worker to keep large JSON parsing off the main thread.

self.onmessage = (e) => {
  try {
    const msg = e && e.data ? e.data : {};
    const id = msg.id;
    const text = msg.text;
    if (typeof id === 'undefined') return;
    if (typeof text !== 'string') {
      self.postMessage({ id, ok: false, error: 'No JSON text provided' });
      return;
    }
    const data = JSON.parse(text);
    self.postMessage({ id, ok: true, data });
  } catch (err) {
    self.postMessage({ id: (e && e.data && e.data.id), ok: false, error: String(err && err.message ? err.message : err) });
  }
};


