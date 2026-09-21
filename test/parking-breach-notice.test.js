import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { layoutBlocks } from '../src/pdf/layout.js';
import { buildPdf } from '../src/pdf/render.js';
import { TEMPLATES, defaultValues, describeMissing, getTemplate, missingFields } from '../src/templates/index.js';
import { parkingBreachNotice as template } from '../src/templates/parking-breach-notice.js';
import { fakeImage, loadFonts, realImage } from './helpers.js';

const full = (extra = {}) => ({
  ownerName: 'Jane Example',
  ownerEmail: 'jane@example.com',
  pmEmail: '',
  unitsPlanNumber: '9999',
  buildingName: 'Example House',
  unitNumber: '12',
  lotNumber: '34',
  streetAddress: '45 Example Street',
  suburb: 'Braddon',
  state: 'ACT',
  postcode: '2612',
  parkingDetails: '',
  observedDate: '2026-09-03',
  vehicleDescription: 'white Toyota Corolla sedan',
  plateState: 'NSW',
  rego: 'ABC123',
  observationDetails: '',
  ruleExcerpt: null,
  evidence: [{ image: fakeImage(600, 800) }],
  strataManagerName: 'Sam Example',
  letterhead: fakeImage(900, 90),
  ...extra,
});

const build = (extra) => template.build(full(extra));
const textOf = (block) => (block.runs ?? []).map((run) => run.text).join('');
/** The text of every paragraph and item, in order. Gaps and images have none and are left out. */
const texts = (blocks) => blocks.filter((block) => block.runs).map(textOf);
const missingRuns = (blocks) => [
  ...blocks.flatMap((block) => (block.runs ?? []).filter((run) => run.missing)),
  ...blocks
    .filter((block) => block.type === 'letterhead' && block.placeholder)
    .map((block) => ({ text: block.placeholder, missing: true })),
];

describe('the wording', () => {
  // The scrubbed source's text with its placeholders filled in, quirks included.
  it('reads as the source does, top to bottom', () => {
    expect(texts(build())).toEqual([
      'Dear Jane Example',
      'Lot 34, Unit 12 of 45 Example Street',
      'Braddon ACT 2612',
      'Email to: jane@example.com',
      'Re UP 9999 ‘Example House’ Breach of Rules – Illegal Parking',
      'Dear Jane Example,',
      'We wish to bring to your attention a breach of rules involving the occupants of Unit 12/45 Example Street parking illegally',
      'On 3 September 2026 the building manager observed that a white Toyota Corolla sedan bearing NSW Number Plates “ABC123” was parked illegally on common property. This is in breach of Owners Corporation Rules 13.2 (c) ‘Parking of Vehicles’.',
      'Please see evidence of the breach below.',
      'Sam Example',
      'For and on behalf of Units Plan 9999 ‘Example House’',
    ]);
  });

  it('has no leftover placeholder when complete', () => {
    expect(missingRuns(build())).toEqual([]);
  });

  it('keeps the source quirks: "Dear" opens the address block with no comma, and the opening paragraph has no full stop', () => {
    const all = texts(build());
    expect(all[0]).toBe('Dear Jane Example');
    expect(all[5]).toBe('Dear Jane Example,');
    expect(all[6].endsWith('parking illegally')).toBe(true);
  });

  it('sets the heading in bold throughout and the manager name in bold', () => {
    const blocks = build();
    const heading = blocks.find((block) => textOf(block).startsWith('Re UP'));
    expect(heading.runs.every((run) => run.bold)).toBe(true);
    const manager = blocks.find((block) => textOf(block) === 'Sam Example');
    expect(manager.runs.every((run) => run.bold)).toBe(true);
    const others = blocks.filter((block) => block.runs && block !== heading && block !== manager);
    for (const block of others) expect(block.runs.some((run) => run.bold)).toBe(false);
  });

  it('trims what the user typed', () => {
    expect(texts(build({ ownerName: '  Jane Example  ', rego: ' ABC123 ' }))[0]).toBe('Dear Jane Example');
    expect(texts(build({ rego: ' ABC123 ' }))[7]).toContain('“ABC123”');
  });
});

describe('the email line', () => {
  const emailLine = (extra) => texts(build(extra)).find((line) => line.startsWith('Email to:'));

  it('has the owner alone when there is no property manager', () => {
    expect(emailLine()).toBe('Email to: jane@example.com');
  });

  it('adds the property manager after the owner, separated by a space as in the source', () => {
    expect(emailLine({ pmEmail: 'pm@example.com' })).toBe('Email to: jane@example.com pm@example.com');
  });

  it('treats a blank property manager email as none', () => {
    expect(emailLine({ pmEmail: '   ' })).toBe('Email to: jane@example.com');
  });
});

describe('the optional parking details', () => {
  const opening = (extra) => texts(build(extra))[6];
  const numbered = (extra) => texts(build(extra))[7];

  it('adds the opening details after "parking illegally", and still no full stop', () => {
    expect(opening({ parkingDetails: 'in the visitor bay' })).toMatch(/parking illegally in the visitor bay$/);
  });

  it('adds the numbered paragraph details before its full stop', () => {
    expect(numbered({ observationDetails: 'blocking the loading dock' })).toContain(
      'was parked illegally on common property blocking the loading dock. This is in breach',
    );
  });

  it('leaves no stray space or full stop when both are blank', () => {
    expect(opening()).not.toMatch(/\s$/);
    expect(numbered()).toContain('on common property. This is');
    expect(numbered()).not.toContain('  ');
  });

  it('treats blank space as blank', () => {
    expect(numbered({ observationDetails: '  ' })).toContain('on common property. This is');
  });
});

describe('the building name', () => {
  it('goes in single quotes in the heading and in the closing line', () => {
    const all = texts(build({ buildingName: 'The Lodge' }));
    expect(all).toContain('Re UP 9999 ‘The Lodge’ Breach of Rules – Illegal Parking');
    expect(all).toContain('For and on behalf of Units Plan 9999 ‘The Lodge’');
  });
});

describe('the rule excerpt', () => {
  it('is left out, with no gap for it, when there is none', () => {
    expect(build().some((block) => block.type === 'image' && block.border)).toBe(false);
  });

  it('is centred, with a 3 pt black border, at the source\'s width, straight after the numbered paragraph', () => {
    const image = fakeImage(771, 444);
    const blocks = build({ ruleExcerpt: image });
    const index = blocks.findIndex((block) => block.type === 'image' && block.border);
    expect(blocks[index]).toMatchObject({ image, align: 'center', border: true, x: 0 });
    expect(blocks[index].borderWidth).toBeCloseTo(3, 6);
    expect(blocks[index].maxWidth).toBeCloseTo(362.2, 1);
    expect(blocks[index - 3].marker).toBe('1.');
    expect(blocks[index + 2]).toMatchObject({ type: 'para' });
    expect(textOf(blocks[index + 2])).toBe('Please see evidence of the breach below.');
  });

  it('lands 8 pt (the paragraph\'s space after) plus the 6.45 pt anchor offset below the paragraph', () => {
    const blocks = build({ ruleExcerpt: fakeImage(771, 444) });
    const index = blocks.findIndex((block) => block.type === 'image' && block.border);
    expect(blocks[index - 1].height).toBeCloseTo(6.45, 2);
    expect(blocks[index - 2]).toEqual({ type: 'blank', height: 8 });
  });
});

const images = (blocks) => blocks.filter((block) => block.type === 'image' && !block.border);

describe('the evidence', () => {
  it('is placed after the closing line, one image per photo, in order', () => {
    const a = fakeImage(600, 800);
    const b = fakeImage(800, 600);
    const blocks = build({ evidence: [{ image: a }, { image: b }] });
    expect(images(blocks).map((block) => block.image)).toEqual([a, b]);
    const closing = blocks.findIndex((block) => textOf(block).startsWith('For and on behalf of'));
    expect(blocks.findIndex((block) => block.type === 'image' && !block.border)).toBeGreaterThan(closing);
  });

  it('shows the source\'s red [Image/s] for a photo not yet added', () => {
    const blocks = build({ evidence: [{ image: null }] });
    expect(missingRuns(blocks)).toEqual([{ text: '[Image/s]', missing: true }]);
    expect(images(blocks)).toHaveLength(0);
  });

  it('is left aligned, without a border', () => {
    const [block] = images(build());
    expect(block).toMatchObject({ x: 0 });
    expect(block.border).toBeUndefined();
  });
});

describe('spacing', () => {
  it('sets every paragraph at the source\'s 1.158 line spacing, with 8 pt after it', () => {
    const blocks = build();
    const paragraphs = blocks.filter((block) => block.runs);
    for (const block of paragraphs) expect(block.lineSpacing).toBeCloseTo(278 / 240, 6);
    // Every paragraph is followed by a gap of 8 pt, except where the excerpt's own gaps take over.
    for (const block of paragraphs) {
      expect(blocks[blocks.indexOf(block) + 1]).toEqual({ type: 'blank', height: 8 });
    }
  });

  it('positions the numbered paragraph where the source numbering puts it, left-aligned', () => {
    const item = build().find((block) => block.type === 'item');
    expect(item).toMatchObject({ marker: '1.', markerX: 18, x: 36, align: 'left' });
  });

  it('lays out the whole letter on one page when it has no images', async () => {
    const fonts = await loadFonts();
    expect(layoutBlocks(build({ evidence: [] }), fonts)).toHaveLength(1);
  });

  it('flows two portrait photos onto a page together after the letter text', async () => {
    const fonts = await loadFonts();
    const pages = layoutBlocks(build({ evidence: [{ image: fakeImage(600, 800) }, { image: fakeImage(600, 800) }] }), fonts);
    const onPage = pages.map((page) => page.ops.filter((op) => op.op === 'image' && op.height <= 300 + 0.01).length);
    expect(onPage.reduce((sum, n) => sum + n, 0)).toBe(2 + pages.length); // the letterhead is on every page
  });
});

describe('unfilled fields', () => {
  it('shows a red placeholder for every required field when blank, one field at a time', () => {
    const byId = new Map(template.fields.map((field) => [field.id, field]));
    const required = template.fields.filter((field) => field.required === true && field.type !== 'group');
    expect(required.length).toBeGreaterThan(10);
    for (const field of required) {
      const blank = field.type === 'image' ? null : '';
      const values = full({ [field.id]: blank });
      const shown = missingRuns(template.build(values)).map((run) => run.text);
      expect(shown, `${field.id} should show ${field.placeholder}`).toContain(field.placeholder);
      expect(missingFields(template, values), field.id).toEqual([field.id]);
    }
    expect(byId.get('evidence').fields[0].placeholder).toBe('[Image/s]');
  });

  it('shows only bracketed placeholders as missing runs', () => {
    for (const run of missingRuns(template.build(defaultValues(template)))) expect(run.text).toMatch(/^\[.+\]$/);
  });

  it('has a placeholder on every required field that is not a group', () => {
    const all = [...template.fields, ...template.fields.flatMap((field) => field.fields ?? [])];
    for (const field of all.filter((f) => f.required && f.type !== 'group')) {
      expect(field.placeholder, field.id).toMatch(/^\[.+\]$/);
    }
  });

  it('shows no placeholder for an optional field', () => {
    const shown = missingRuns(template.build(defaultValues(template))).map((run) => run.text);
    for (const id of ['pmEmail', 'parkingDetails', 'observationDetails', 'ruleExcerpt']) {
      expect(template.fields.find((field) => field.id === id).placeholder, id).toBeUndefined();
    }
    expect(shown).not.toContain('undefined');
  });
});

describe('missingFields and describeMissing', () => {
  it('is empty for a complete letter, so download is enabled', () => {
    expect(missingFields(template, full())).toEqual([]);
  });

  it('does not require the property manager, either detail or the rule excerpt', () => {
    expect(
      missingFields(template, full({ pmEmail: '', parkingDetails: '', observationDetails: '', ruleExcerpt: null })),
    ).toEqual([]);
  });

  it('requires at least one photo, and an image in each one added', () => {
    expect(missingFields(template, full({ evidence: [] }))).toEqual(['evidence']);
    expect(missingFields(template, full({ evidence: [{ image: fakeImage(1, 1) }, { image: null }] }))).toEqual([
      'evidence.1.image',
    ]);
  });

  it('requires the letterhead, the building name, the state and the postcode', () => {
    expect(missingFields(template, full({ letterhead: null, buildingName: '', state: '', postcode: '' }))).toEqual([
      'letterhead',
      'buildingName',
      'state',
      'postcode',
    ]);
  });

  it('names a missing field by its label, in the form\'s order', () => {
    const paths = missingFields(template, full({ ownerName: '', rego: '', evidence: [{ image: null }] }));
    expect(describeMissing(template, paths)).toEqual([
      { path: 'ownerName', label: 'Owner name' },
      { path: 'rego', label: 'Registration' },
      { path: 'evidence.0.image', label: 'Photo 1: Image' },
    ]);
  });

  it('flags a missing observed date', () => {
    expect(missingFields(template, full({ observedDate: '' }))).toEqual(['observedDate']);
  });
});

describe('defaults', () => {
  it('starts with nothing filled, one empty photo and no images', () => {
    const values = defaultValues(template);
    expect(values.evidence).toEqual([{ image: null }]);
    expect(values.ruleExcerpt).toBeNull();
    expect(values.letterhead).toBeNull();
    expect(values.observedDate).toBe('');
  });

  it('gives the screenshot reader the same field ids the first template has', () => {
    const ids = new Set(template.fields.map((field) => field.id));
    for (const id of [
      'ownerName',
      'ownerEmail',
      'unitsPlanNumber',
      'buildingName',
      'lotNumber',
      'unitNumber',
      'streetAddress',
      'suburb',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });
});

describe('the definition', () => {
  it('is registered and found by id', () => {
    expect(TEMPLATES).toContain(template);
    expect(getTemplate('parking-breach-notice')).toBe(template);
  });

  it('puts every field in a section that exists', () => {
    const sections = new Set(template.sections.map((section) => section.id));
    for (const field of template.fields) expect(sections.has(field.section), field.id).toBe(true);
  });

  it('names the download as today\'s date in Canberra, the units plan and the lot', () => {
    // 2026-09-20 15:00 UTC is 01:00 on the 21st in Canberra.
    expect(template.filename(full(), new Date('2026-09-20T15:00:00Z'))).toBe(
      '20260921 UP9999 Parking Breach Notice - Lot 34.pdf',
    );
  });

  it('cannot put a path separator into the filename', () => {
    expect(template.filename(full({ lotNumber: '12/3', unitsPlanNumber: 'A:B' }), new Date('2026-09-21T00:00:00Z'))).toBe(
      '20260921 UPA-B Parking Breach Notice - Lot 12-3.pdf',
    );
  });
});

describe('the PDF', () => {
  it('builds for a complete letter with every image, a blank form, and the most photos allowed', async () => {
    const letterhead = realImage(900, 90);
    const cases = [
      full({ letterhead, ruleExcerpt: realImage(771, 444), evidence: [{ image: realImage(600, 800) }] }),
      defaultValues(template),
      full({ letterhead, evidence: Array.from({ length: 10 }, () => ({ image: realImage(600, 800) })) }),
    ];
    const docs = await Promise.all(cases.map(async (values) => PDFDocument.load(await buildPdf(template, values))));
    for (const doc of docs) expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(docs[2].getPageCount()).toBeGreaterThan(1);
  });
});
