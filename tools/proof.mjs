/*
  Writes proof renders of every template to .proof/, so a change to the typesetting can be
  looked at rather than reasoned about. Run `npm run proof`, then open the PDFs — or on macOS
  `qlmanage -t -s 1600 -o .proof .proof/<id>.pdf` for a PNG of page 1.

  Two files per template: `<id>.pdf`, filled in with sample values, and `<id>-blank.pdf`, the
  form as a fresh visitor sees it, every missing value showing as its red placeholder.

  Quick Look renders page 1 of a PDF only, so each page of the filled sample is also written as
  its own file, `<id>-page-N.pdf`, for `qlmanage -t -s 1600 -o .proof .proof/<id>-page-2.pdf`.

  The sample values are obviously fake on purpose, and the images are generated here rather
  than read from anywhere: never put a real units plan, owner, seal or letterhead into a file
  this repo can commit. `.proof/` is gitignored.
*/
import { mkdirSync, writeFileSync } from 'node:fs';

import { PDFDocument } from 'pdf-lib';
import { crc32, deflateSync } from 'node:zlib';

import { buildPdf } from '../src/pdf/render.js';
import { TEMPLATES, defaultValues } from '../src/templates/index.js';

/** One PNG chunk: length, type, data, CRC over type and data. */
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** A solid-colour PNG with a darker 3 px frame — enough to see where an image lands and how it is bordered. */
function fakePng(width, height, [r, g, b]) {
  const row = 1 + width * 3;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = x < 3 || y < 3 || x >= width - 3 || y >= height - 3;
      const at = y * row + 1 + x * 3;
      raw[at] = edge ? r >> 1 : r;
      raw[at + 1] = edge ? g >> 1 : g;
      raw[at + 2] = edge ? b >> 1 : b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return {
    bytes: new Uint8Array(
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
      ]),
    ),
    type: 'png',
    width,
    height,
  };
}

/** Fake values per template id. */
const SAMPLES = {
  'infringement-notice': () => ({
    noticeDate: '2026-09-19',
    ownerName: 'Jane Example',
    careOf: '',
    address1: '1 Example Road',
    address2: 'Exampleton ACT 2999',
    address3: '',
    hasPropertyManager: false,
    pmEmail: '',
    ownerEmail: 'jane@example.com',
    unitsPlanNumber: '9999',
    unitNumber: '12',
    lotNumber: '34',
    buildingName: '',
    streetAddress: '45 Example Street',
    suburb: 'Braddon',
    rules: [
      {
        ruleNumber: 'Rule 12',
        ruleDescription: 'noise',
        breachDetails:
          'On 1 September 2026 at approximately 11:30 pm, loud music was reported from the unit by two neighbours.\n\nA second complaint followed on 3 September 2026.',
        image: fakePng(600, 160, [235, 235, 235]),
      },
    ],
    confirmByDate: '2026-09-26',
    additionalRequests: '',
    strataManagerName: 'Sam Example',
    seal: fakePng(240, 200, [190, 210, 235]),
    letterhead: fakePng(900, 90, [246, 193, 206]),
  }),
  'parking-breach-notice': () => ({
    noticeDate: '2026-09-21',
    ownerName: 'Jane Example',
    addressToOccupier: false,
    careOf: 'Example Property Management',
    addresseeName: 'Jane Example',
    ownerEmail: 'jane@example.com',
    pmEmail: 'pm@example.com',
    unitsPlanNumber: '9999',
    buildingName: 'Example House',
    unitNumber: '12',
    lotNumber: '34',
    streetAddress: '45 Example Street',
    suburb: 'Braddon',
    state: 'ACT',
    postcode: '2612',
    parkingDetails: 'in the visitor bay',
    observedDate: '2026-09-03',
    vehicleDescription: 'white Toyota Corolla sedan',
    plateState: 'NSW',
    rego: 'ABC123',
    observationDetails: 'blocking the loading dock',
    ruleExcerpt: fakePng(771, 444, [240, 240, 240]),
    evidence: [
      { image: fakePng(600, 800, [200, 215, 200]) },
      { image: fakePng(800, 600, [215, 200, 200]) },
    ],
    strataManagerName: 'Sam Example',
    letterhead: fakePng(900, 90, [246, 193, 206]),
  }),
};

/** Each page of a PDF as its own one-page file. */
async function writePages(name, bytes) {
  const source = await PDFDocument.load(bytes);
  await Promise.all(
    source.getPageIndices().map(async (index) => {
      const single = await PDFDocument.create();
      const [page] = await single.copyPages(source, [index]);
      single.addPage(page);
      writeFileSync(`.proof/${name}-page-${index + 1}.pdf`, await single.save());
    }),
  );
}

mkdirSync('.proof', { recursive: true });
if (TEMPLATES.length === 0) console.log('No templates yet.');

const jobs = TEMPLATES.flatMap((template) => {
  const sample = SAMPLES[template.id]?.();
  const targets = [[`${template.id}-blank`, defaultValues(template)]];
  if (sample) targets.unshift([template.id, sample]);
  return targets.map(async ([name, values]) => {
    const bytes = await buildPdf(template, values);
    writeFileSync(`.proof/${name}.pdf`, bytes);
    if (name === template.id) await writePages(name, bytes);
    return `.proof/${name}.pdf — ${bytes.length} bytes`;
  });
});
for (const line of await Promise.all(jobs)) console.log(line);
