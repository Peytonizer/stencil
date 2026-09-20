/*
  Runs Tesseract in a worker and returns the words it finds. Loaded on demand, because it carries
  about 3.9 MB of WebAssembly and 4 MB of language data that a page which never reads a
  screenshot has no use for.

  Everything comes from this site. The three pieces tesseract.js would otherwise fetch from a CDN
  are bundled instead:

    worker script    an asset, run in a blob: worker (`worker-src blob:`). A blob worker inherits
                     this page's Content-Security-Policy, so it is bound by it; one loaded from
                     a URL would take its policy from response headers, and GitHub Pages sends
                     none of ours.
    core (WASM)      an asset, `importScripts`-ed. The `.wasm.js` variant carries the WebAssembly
                     inside it, so there is no separate .wasm request. Needs 'wasm-unsafe-eval'.
    language data    bundled into this chunk as base64 (see `base64Plugin` in vite.config.js)
                     and decoded here. tesseract.js would
                     `fetch` it, which the policy has no `connect-src` to allow.

  This speaks tesseract.js's worker protocol directly instead of calling its `createWorker`,
  because `createWorker` cannot be given language data as bytes: its `initialize` step joins each
  language object's `data` into the language name, so the engine is asked to open a file called
  "31,139,8,8,50,...". Found in 7.0.0; the version is pinned exactly because the protocol below is
  internal to it. Re-check both when it moves.

  Nothing is cached. tesseract.js writes language data to IndexedDB unless told not to, which
  would break "nothing persisted"; `cacheMethod: 'none'` stops it.
*/

import workerUrl from 'tesseract.js/dist/worker.min.js?url';
// The SIMD, LSTM-only build: every current browser runs SIMD, and LSTM-only is the smaller core.
import coreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import languageData from '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?base64';

/** Tesseract's LSTM_ONLY engine mode. */
const OEM_LSTM_ONLY = 1;
/** "Sparse text": find as much text as possible, in no particular order. The screen is labels
 *  and boxes, not paragraphs. */
const PSM_SPARSE_TEXT = '11';

/** A blob worker resolves nothing relative to the page, so the paths handed to it are absolute. */
const absolute = (url) => new URL(url, location.href).href;

function decodeBase64(text) {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

/**
 * Start a worker and get it ready to read. `onProgress(status, fraction)` reports the loading
 * steps. Returns `{ recognize(pngBytes) => words, terminate() }`.
 */
export async function createEngine(onProgress = () => {}) {
  const blob = new Blob([`importScripts(${JSON.stringify(absolute(workerUrl))});`], {
    type: 'text/javascript',
  });
  const worker = new Worker(URL.createObjectURL(blob));

  let jobs = 0;
  const pending = new Map();
  let progress = onProgress;

  worker.addEventListener('message', ({ data: message }) => {
    const job = pending.get(message.jobId);
    if (!job) return;
    if (message.status === 'progress') {
      progress(message.data.status, message.data.progress);
    } else {
      pending.delete(message.jobId);
      if (message.status === 'resolve') job.resolve(message.data);
      else job.reject(new Error(String(message.data)));
    }
  });
  worker.addEventListener('error', (event) => {
    for (const job of pending.values()) job.reject(new Error(event.message || 'worker failed'));
    pending.clear();
  });

  const send = (action, payload, transfer = []) =>
    new Promise((resolve, reject) => {
      jobs += 1;
      pending.set(`job-${jobs}`, { resolve, reject });
      worker.postMessage({ workerId: 'stencil', jobId: `job-${jobs}`, action, payload }, transfer);
    });

  try {
    await send('load', {
      options: { lstmOnly: true, corePath: absolute(coreUrl), logging: false },
    });
    await send('loadLanguage', {
      langs: [{ code: 'eng', data: decodeBase64(languageData) }],
      options: { langPath: '', cacheMethod: 'none', gzip: true, lstmOnly: true },
    });
    // By name this time: the bytes are already in the worker's filesystem.
    await send('initialize', { langs: 'eng', oem: OEM_LSTM_ONLY, config: {} });
    await send('setParameters', { params: { tessedit_pageseg_mode: PSM_SPARSE_TEXT } });
  } catch (error) {
    worker.terminate();
    throw error;
  }

  return {
    async recognize(bytes, onStatus) {
      progress = onStatus ?? onProgress;
      const result = await send(
        'recognize',
        { image: bytes, options: {}, output: { text: false, blocks: true } },
        [bytes.buffer],
      );
      const words = [];
      for (const block of result.blocks ?? []) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) words.push(...line.words);
        }
      }
      return words;
    },
    terminate: () => worker.terminate(),
  };
}
