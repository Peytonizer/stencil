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
/** "Treat the image as a single text line". */
const PSM_SINGLE_LINE = '7';
/** What a lot, unit or street number is made of. */
const CODE_CHARACTERS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/-';

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

  const send = (action, payload) =>
    new Promise((resolve, reject) => {
      jobs += 1;
      pending.set(`job-${jobs}`, { resolve, reject });
      worker.postMessage({ workerId: 'stencil', jobId: `job-${jobs}`, action, payload });
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
      // `bytes` is copied, not transferred: the same image is read again for the short values.
      const result = await send('recognize', {
        image: bytes,
        options: {},
        output: { text: false, blocks: true },
      });
      const words = [];
      for (const block of result.blocks ?? []) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) words.push(...line.words);
        }
      }
      return words;
    },
    /**
     * Read one box of the image on its own, as a single line of letters, digits, slash and dash.
     * `box` is `{ left, top, width, height }` in the image's pixels. This is what fixes the small
     * boxes that the whole-page pass reads badly (a lot number touching its label's asterisk went
     * from 62% to 90%), and a single line with a whitelist can't come back as a paragraph of noise.
     */
    async recognizeLine(bytes, box) {
      const result = await send('recognize', {
        image: bytes,
        options: {
          rectangle: box,
          tessedit_pageseg_mode: PSM_SINGLE_LINE,
          tessedit_char_whitelist: CODE_CHARACTERS,
        },
        output: { text: true },
      });
      return { text: result.text.trim(), confidence: result.confidence };
    },
    terminate: () => worker.terminate(),
  };
}
