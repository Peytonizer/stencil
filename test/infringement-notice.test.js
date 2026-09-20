import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { addDays, todayInCanberra } from '../src/format.js';
import { layoutBlocks } from '../src/pdf/layout.js';
import { buildPdf } from '../src/pdf/render.js';
import { TEMPLATES, defaultValues, getTemplate, missingFields } from '../src/templates/index.js';
import { infringementNotice as template } from '../src/templates/infringement-notice.js';
import { fakeImage, loadFonts, realImage } from './helpers.js';

const rule = (extra = {}) => ({
  ruleNumber: 'Rule 12',
  ruleDescription: 'noise',
  breachDetails: 'Loud music at 11 pm.\nAgain the next night.',
  image: null,
  ...extra,
});

const full = (extra = {}) => ({
  noticeDate: '2026-09-19',
  ownerName: 'Jane Example',
  careOf: '',
  address1: '1 Example Road',
  address2: '',
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
  rules: [rule()],
  confirmByDate: '2026-09-26',
  additionalRequests: '',
  strataManagerName: 'Sam Example',
  seal: null,
  letterhead: fakeImage(900, 90),
  ...extra,
});

/** The flowing blocks, with keep groups opened out. The letterhead is a header, not part of the flow. */
const flat = (blocks) =>
  blocks
    .filter((block) => block.type !== 'letterhead')
    .flatMap((block) => (block.type === 'keep' ? block.blocks : [block]));
const build = (extra) => template.build(full(extra));
const textOf = (block) => (block.runs ?? []).map((run) => run.text).join('');
/** The text of every paragraph and item, in order; a blank is ''. */
const texts = (blocks) => flat(blocks).map((block) => (block.type === 'blank' ? '' : textOf(block)));
const missingRuns = (blocks) => [
  ...flat(blocks).flatMap((block) => (block.runs ?? []).filter((run) => run.missing)),
  // A missing letterhead shows as a red placeholder in the header band.
  ...blocks
    .filter((block) => block.type === 'letterhead' && block.placeholder)
    .map((block) => ({ text: block.placeholder, missing: true })),
];

describe('the wording', () => {
  // Copied from SPEC.md's block listing, which is the source's wording, quirks included.
  const clauses = [
    'It has been approved by the Executive Committee of The Owners Units Plan 9999 to issue an infringement notice to the owner of Unit 12 (Lot 34) of UP 9999.',
    "Jane Example is recorded in the Corporation's records as being the Owner of Lot 34 being 12, 45 Example Street, Braddon in Units Plan No 9999.",
    'With reference to Section 107 of the Unit Titles (Management) Act 2011, the Owner and Occupiers of the unit are bound by the rules of the Corporation and those reflected in the Unit Titles (Management) Act 2011.',
    'The Owners Corporation believes that the Owner and/or the Occupiers of the unit are in breach of the Owners Corporation Rules and/or those reflected in the Unit Titles (Management) Act 2011 and detailed in Schedule A of this Notice.',
    'Please take note that the Owner and Occupiers are bound by the provisions of the Unit Titles (Management) Act 2011 and that pursuant to Section 109 of that Act, you are hereby given notice to remedy the breach.',
    'Should the Owner or Occupiers not comply with this notice -',
    'the Owner/Occupiers commit an offence, and',
    'the Owners Corporation may, without further notice, apply to the ACAT (ACT Civil and Administrative Tribunal) for an order in relation to the failure to comply with the notice.',
    'Pursuant to Section 31 of the Unit Titles (Management) Act 2011, the Owners Corporation will recover all expenditure incurred in pursuing rectification of the rules breached, from the Owner/s of the unit.',
  ];

  it('contains every page 1 clause exactly as written', () => {
    const all = texts(build());
    for (const clause of clauses) expect(all).toContain(clause);
  });

  it('contains the headings and the standard remedies exactly as written', () => {
    const all = texts(build());
    for (const line of [
      'RULE INFRINGEMENT NOTICE',
      'Pursuant to Section 109 of the Unit Titles (Management) Act 2011',
      'Please be advised of the following:',
      'SCHEDULE A',
      'The Owners Corporation believes that the following rules have been contravened:',
      'The Owners Corporation requests that the contravention be remedied with immediate effect as follows:',
      'That the occupiers be issued with an infringement notice.',
      'That the occupiers be advised of the Owners Corporation Rules and abide by these rules. A copy of the rules be provided to the occupier upon issuance of the breach notice.',
      'The Owners Corporation care of the Managing Agent to be advised of the course of action to be taken.',
      'The Owners Corporation care of the Managing Agent to be provided with confirmation of the aforementioned actions by close of business on 26/09/2026',
      'The Owners Corporation requests that the contravention of these rules not be repeated.',
      'The Common Seal of',
      'The Owners - Units Plan No.9999',
      'was hereunto affixed in the presence of:',
      'Sam Example (Authorised Agent)',
      'Rule 12, which relates to noise.',
    ]) {
      expect(all).toContain(line);
    }
  });

  it('has no leftover placeholder when complete', () => {
    expect(missingRuns(build())).toEqual([]);
  });

  it('has remedy (d) without a full stop, as the source has it', () => {
    const d = texts(build()).find((line) => line.includes('by close of business on'));
    expect(d.endsWith('26/09/2026')).toBe(true);
  });

  it('keeps the source\'s spacing quirks: no full stop in "Units Plan No 9999", none after "No." in the seal block', () => {
    const all = texts(build()).join('\n');
    expect(all).toContain('in Units Plan No 9999.');
    expect(all).toContain('The Owners - Units Plan No.9999');
  });
});

describe('the letter heading', () => {
  it('dates the notice as D MMM YYYY', () => {
    expect(texts(build())[0]).toBe('19 Sep 2026');
  });

  it('omits the care-of line when blank and puts it after the name when given', () => {
    expect(texts(build()).slice(0, 5)).toEqual(['19 Sep 2026', '', 'Jane Example', '1 Example Road', '']);
    expect(texts(build({ careOf: 'C/- Example Management' })).slice(2, 5)).toEqual([
      'Jane Example',
      'C/- Example Management',
      '1 Example Road',
    ]);
  });

  it('omits address lines 2 and 3 when blank and keeps them in order when given', () => {
    const lines = texts(build({ address2: 'Line Two', address3: 'Line Three' }));
    expect(lines.slice(3, 6)).toEqual(['1 Example Road', 'Line Two', 'Line Three']);
    expect(texts(build({ address3: 'Only Three' })).slice(3, 5)).toEqual(['1 Example Road', 'Only Three']);
  });

  it('trims what the user typed', () => {
    expect(texts(build({ ownerName: '  Jane Example  ' }))[2]).toBe('Jane Example');
  });

  it('sends to the owner alone when there is no property manager', () => {
    const lines = texts(build());
    expect(lines).toContain('Sent via email: jane@example.com');
    expect(lines.some((line) => line.startsWith('cc:'))).toBe(false);
  });

  it('sends to the property manager with the owner in cc when there is one', () => {
    const lines = texts(build({ hasPropertyManager: true, pmEmail: 'pm@example.com' }));
    expect(lines).toContain('Sent via email: pm@example.com');
    expect(lines).toContain('cc: jane@example.com');
  });

  it('ignores a property manager email typed before the box was unticked', () => {
    const lines = texts(build({ hasPropertyManager: false, pmEmail: 'pm@example.com' }));
    expect(lines.join('\n')).not.toContain('pm@example.com');
  });

  it('starts with the letterhead, or a red placeholder for it while it is missing', () => {
    const image = fakeImage(100, 20);
    expect(build({ letterhead: image })[0]).toEqual({ type: 'letterhead', image });
    expect(build({ letterhead: null })[0]).toEqual({ type: 'letterhead', placeholder: '[Letterhead]' });
  });
});

describe('clause 1 and the building name', () => {
  const clause1 = (extra) => texts(build(extra)).find((line) => line.startsWith('It has been approved'));

  it('ends the sentence at the plan number when the building has no name', () => {
    expect(clause1()).toMatch(/of UP 9999\.$/);
  });

  it('adds a comma and the name when it has one', () => {
    expect(clause1({ buildingName: 'Example House' })).toMatch(/of UP 9999, Example House\.$/);
  });
});

describe('alignment', () => {
  it('leaves clause 2 left-aligned and justifies the other numbered clauses', () => {
    const items = flat(build()).filter((block) => block.type === 'item' && block.markerX === 18);
    expect(items.map((block) => [block.marker, block.align])).toEqual([
      ['1.', 'justify'],
      ['2.', 'left'],
      ['3.', 'justify'],
      ['4.', 'justify'],
      ['5.', 'justify'],
      ['6.', 'justify'],
    ]);
  });

  it('positions page 1 clauses and sub-items where the source numbering puts them', () => {
    const items = flat(build()).filter((block) => block.type === 'item');
    const clause = items.find((block) => block.marker === '1.' && block.markerX === 18);
    const sub = items.find((block) => block.marker === 'a.' && block.markerX === 54);
    expect(clause).toMatchObject({ markerX: 18, x: 36 });
    expect(sub).toMatchObject({ markerX: 54, x: 72 });
  });

  it('sets SCHEDULE A at 11.5 pt and keeps every Schedule A heading with what follows', () => {
    const blocks = flat(build());
    const heading = blocks.find((block) => textOf(block) === 'SCHEDULE A');
    expect(heading).toMatchObject({ size: 11.5, keepWithNext: true });
    const clauses = blocks.filter((block) => block.type === 'item' && block.markerX === 0);
    expect(clauses.map((block) => [block.marker, block.keepWithNext, block.markerBold])).toEqual([
      ['1.', true, true],
      ['2.', true, true],
      ['3.', true, true],
    ]);
  });

  it("justifies Schedule A's clause 2, the remedies and the breach details, and no more", () => {
    const blocks = flat(build());
    const align = (predicate) => blocks.find(predicate).align;
    expect(align((b) => b.marker === '1.' && b.markerX === 0)).toBe('left');
    expect(align((b) => b.marker === '2.' && b.markerX === 0)).toBe('justify');
    expect(align((b) => b.marker === '3.' && b.markerX === 0)).toBe('left');
    expect(align((b) => b.marker === 'a.' && b.markerX === 36)).toBe('justify');
    expect(align((b) => textOf(b).startsWith('Loud music'))).toBe('justify');
  });
});

describe('rules', () => {
  const ruleMarkers = (blocks) =>
    flat(blocks)
      .filter((block) => block.type === 'item' && block.markerX === 36 && block.marker.endsWith(')'))
      .map((block) => block.marker);

  it('letters one rule a)', () => {
    expect(ruleMarkers(build())).toEqual(['a)']);
  });

  it('letters three rules a) b) c), each with its own text', () => {
    const blocks = build({
      rules: [rule(), rule({ ruleNumber: 'Rule 13', ruleDescription: 'pets' }), rule({ ruleNumber: 'Rule 14' })],
    });
    expect(ruleMarkers(blocks)).toEqual(['a)', 'b)', 'c)']);
    expect(texts(blocks)).toContain('Rule 13, which relates to pets.');
  });

  it('sets breach details in italics and keeps the line breaks in the text', () => {
    const details = flat(build()).find((block) => textOf(block).startsWith('Loud music'));
    expect(details.runs[0].italic).toBe(true);
    expect(details.runs[0].text).toBe('Loud music at 11 pm.\nAgain the next night.');
    expect(details.x).toBe(36);
  });

  it('adds a bordered image and a blank after it only when the rule has one', () => {
    const image = fakeImage(300, 100);
    const without = flat(build());
    expect(without.some((block) => block.type === 'image')).toBe(false);

    const withImage = flat(build({ rules: [rule({ image })] }));
    const index = withImage.findIndex((block) => block.type === 'image');
    expect(withImage[index]).toMatchObject({ image, x: 36, border: true });
    expect(withImage[index + 1]).toEqual({ type: 'blank' });
    expect(withImage.length).toBe(without.length + 2);
  });
});

describe('Schedule A clause 2 and the space before clause 3', () => {
  it('keeps clause 2, its blank line and all four remedies in one group', () => {
    const group = build().find(
      (block) => block.type === 'keep' && block.blocks[0]?.marker === '2.' && block.blocks[0]?.markerX === 0,
    );
    expect(group.blocks.map((block) => block.marker ?? block.type)).toEqual(['2.', 'blank', 'a.', 'b.', 'c.', 'd.']);
  });

  it('puts one blank line between remedy d and clause 3, and clause 3 outside the group', () => {
    const blocks = build();
    const at = blocks.findIndex((block) => block.marker === '3.' && block.markerX === 0);
    expect(blocks[at - 1]).toEqual({ type: 'blank' });
    expect(blocks[at - 2].type).toBe('keep');
  });
});

const pageOf = (pages, needle) =>
  pages.findIndex((page) => page.ops.some((op) => op.op === 'text' && op.text.includes(needle)));

describe('clause 3 and the seal', () => {
  // The chain that keeps clause 3 with the seal runs through the additional requests. When it
  // stopped at them, clause 3 could be left at the foot of a page with the seal on the next.
  it('keeps the additional requests with what follows them', () => {
    const blocks = flat(build({ additionalRequests: 'Please respond promptly.' }));
    const index = blocks.findIndex((block) => textOf(block) === 'Please respond promptly.');
    expect(blocks[index].keepWithNext).toBe(true);
  });

  it.each(['', 'Please respond promptly.', 'One line.\nTwo lines.'])(
    'puts clause 3 on the seal\'s page however far down the page it falls (additional: %j)',
    async (additionalRequests) => {
      const fonts = await loadFonts();
      for (let lines = 0; lines <= 45; lines++) {
        const breachDetails = Array.from({ length: lines }, (_, i) => `Detail ${i}`).join('\n');
        const rules = [rule({ breachDetails }), rule({ breachDetails })];
        const pages = layoutBlocks(build({ rules, additionalRequests, seal: fakeImage(240, 200) }), fonts);
        const clause3 = pageOf(pages, 'requests that the contravention of these');
        expect(pageOf(pages, 'be repeated.'), `${lines} lines: clause 3 splits`).toBe(clause3);
        expect(pageOf(pages, 'The Common Seal of'), `${lines} lines: seal apart from clause 3`).toBe(clause3);
      }
    },
  );
});

describe('the space before Schedule A clause 2', () => {
  const blanksBeforeClause2 = (extra) => {
    const blocks = flat(build(extra));
    const at = blocks.findIndex((block) => block.marker === '2.' && block.markerX === 0);
    let count = 0;
    while (blocks[at - 1 - count]?.type === 'blank') count++;
    return count;
  };

  it('is one blank line, with or without an image, and however many rules there are', () => {
    const image = fakeImage(300, 100);
    expect(blanksBeforeClause2()).toBe(1);
    expect(blanksBeforeClause2({ rules: [rule({ image })] })).toBe(1);
    expect(blanksBeforeClause2({ rules: [rule(), rule({ image }), rule()] })).toBe(1);
  });

  it('keeps one blank line between one rule and the next', () => {
    const blocks = flat(build({ rules: [rule(), rule()] }));
    const second = blocks.findIndex((block) => block.marker === 'b)');
    expect(blocks[second - 1]).toEqual({ type: 'blank' });
    expect(blocks[second - 2].type).toBe('para');
  });
});

describe("Schedule A's remedies and closing requests", () => {
  it('lists the four standard remedies as a. b. c. d.', () => {
    const remedies = flat(build()).filter((block) => block.type === 'item' && block.markerX === 36 && /^[a-d]\.$/.test(block.marker));
    expect(remedies.map((block) => [block.marker, block.x])).toEqual([
      ['a.', 54],
      ['b.', 54],
      ['c.', 54],
      ['d.', 54],
    ]);
  });

  it('gives no line for additional requests, or a blank after them, when there are none', () => {
    const lines = texts(build());
    const at = lines.indexOf('The Owners Corporation requests that the contravention of these rules not be repeated.');
    expect(lines.slice(at + 1, at + 3)).toEqual(['', 'The Common Seal of']);
  });

  it('prints additional requests at x 18, with a blank after, keeping their line breaks', () => {
    const blocks = flat(build({ additionalRequests: '  First line.\nSecond line.  ' }));
    const index = blocks.findIndex((block) => textOf(block) === 'First line.\nSecond line.');
    expect(blocks[index]).toMatchObject({ x: 18, align: 'left' });
    expect(blocks[index - 1]).toEqual({ type: 'blank' });
    expect(blocks[index + 1]).toEqual({ type: 'blank' });
    expect(textOf(blocks[index + 2])).toBe('The Common Seal of');
  });
});

describe('the seal block', () => {
  it('is one kept-together block at x 18, ending the notice', () => {
    const blocks = build();
    const last = blocks[blocks.length - 1];
    expect(last.type).toBe('keep');
    expect(last.blocks.filter((block) => block.type === 'para').every((block) => block.x === 18)).toBe(true);
  });

  it('draws the seal within 180 × 140 pt at x 18 when there is one, and nothing when there is not', () => {
    const seal = fakeImage(600, 600);
    const withSeal = build({ seal });
    const image = withSeal[withSeal.length - 1].blocks.at(-1);
    expect(image).toMatchObject({ type: 'image', image: seal, x: 18, maxWidth: 180, maxHeight: 140 });
    expect(build()[build().length - 1].blocks.some((block) => block.type === 'image')).toBe(false);
  });
});

const empty = () => ({ ...defaultValues(template), hasPropertyManager: true, noticeDate: '', confirmByDate: '' });

describe('unfilled fields', () => {
  it('shows a red placeholder for every required field that is missing', () => {
    const values = empty();
    const blocks = template.build(values);
    const shown = new Set(missingRuns(blocks).map((run) => run.text));
    const byId = new Map(template.fields.map((field) => [field.id, field]));
    const ruleFields = new Map(byId.get('rules').fields.map((field) => [field.id, field]));

    const missing = missingFields(template, values);
    expect(missing.length).toBeGreaterThan(10);
    for (const path of missing) {
      const id = path.split('.').at(-1);
      const field = byId.get(id) ?? ruleFields.get(id);
      expect(shown, `${path} should show ${field.placeholder}`).toContain(field.placeholder);
    }
  });

  it('shows only bracketed placeholders as missing runs', () => {
    for (const run of missingRuns(template.build(empty()))) expect(run.text).toMatch(/^\[.+\]$/);
  });

  it('has a placeholder wherever it needs one', () => {
    for (const field of template.fields.filter((f) => f.required)) {
      if (field.type !== 'group') expect(field.placeholder, field.id).toMatch(/^\[.+\]$/);
    }
  });

  it('shows the property manager email placeholder only when there is a property manager', () => {
    const base = { ...defaultValues(template), ownerEmail: 'jane@example.com' };
    const ph = (values) => missingRuns(template.build(values)).map((run) => run.text);
    expect(ph({ ...base, hasPropertyManager: true })).toContain('[PM email]');
    expect(ph({ ...base, hasPropertyManager: false })).not.toContain('[PM email]');
  });
});

describe('missingFields', () => {
  it('is empty for a complete notice, so download is enabled', () => {
    expect(missingFields(template, full())).toEqual([]);
  });

  it('lists required-but-empty fields by path, including inside a rule', () => {
    const list = missingFields(template, full({ ownerName: ' ', rules: [rule(), rule({ breachDetails: '' })] }));
    expect(list).toEqual(['ownerName', 'rules.1.breachDetails']);
  });

  it('asks for the property manager email only when the box is ticked', () => {
    expect(missingFields(template, full({ hasPropertyManager: true }))).toEqual(['pmEmail']);
    expect(missingFields(template, full({ hasPropertyManager: false }))).toEqual([]);
  });

  it('needs at least one rule', () => {
    expect(missingFields(template, full({ rules: [] }))).toEqual(['rules']);
  });

  it('does not require the seal or any optional line', () => {
    expect(missingFields(template, full({ seal: null, careOf: '', buildingName: '' }))).toEqual([]);
  });

  it('requires the letterhead, so no notice can go out without one', () => {
    expect(missingFields(template, full({ letterhead: null }))).toEqual(['letterhead']);
  });

  it('flags a missing date', () => {
    expect(missingFields(template, full({ noticeDate: '', confirmByDate: '' }))).toEqual(['noticeDate', 'confirmByDate']);
  });
});

describe('defaults', () => {
  it("dates the notice today in Canberra and the confirm-by date 7 days on", () => {
    const values = defaultValues(template);
    expect(values.noticeDate).toBe(todayInCanberra());
    expect(values.confirmByDate).toBe(addDays(values.noticeDate, 7));
  });

  it('starts with one empty rule, no property manager and no images', () => {
    const values = defaultValues(template);
    expect(values.rules).toEqual([{ ruleNumber: '', ruleDescription: '', breachDetails: '', image: null }]);
    expect(values.hasPropertyManager).toBe(false);
    expect(values.seal).toBeNull();
    expect(values.letterhead).toBeNull();
  });
});

describe('the definition', () => {
  it('is registered and found by id', () => {
    expect(TEMPLATES).toContain(template);
    expect(getTemplate('infringement-notice')).toBe(template);
    expect(getTemplate('nope')).toBeNull();
  });

  it('puts every field in a section that exists', () => {
    const sections = new Set(template.sections.map((section) => section.id));
    for (const field of template.fields) expect(sections.has(field.section), field.id).toBe(true);
  });

  it('names the download as the date, the units plan and the lot', () => {
    expect(template.filename(full())).toBe('20260919 UP9999 Infringement Notice - Lot 34.pdf');
  });

  it('cannot put a path separator into the filename', () => {
    expect(template.filename(full({ lotNumber: '12/3', unitsPlanNumber: 'A:B' }))).toBe(
      '20260919 UPA-B Infringement Notice - Lot 12-3.pdf',
    );
  });
});

describe('the PDF', () => {
  it('builds for a complete notice, a blank form, and the most rules allowed', async () => {
    const letterhead = realImage(900, 90);
    const cases = [
      full({ letterhead }),
      defaultValues(template),
      full({ letterhead, rules: Array.from({ length: 10 }, () => rule({ image: null })) }),
    ];
    const docs = await Promise.all(cases.map(async (values) => PDFDocument.load(await buildPdf(template, values))));
    for (const doc of docs) expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    // The letterhead is every page's header, so a multi-page notice carries it on each.
    expect(docs[2].getPageCount()).toBeGreaterThan(1);
  });
});
