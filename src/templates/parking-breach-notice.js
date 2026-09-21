/*
  The Parking Breach Notice: a letter to an owner whose occupants parked illegally on common
  property, quoting the rule and attaching photos of the breach.

  Unlike the Rule Infringement Notice this source is a plain letter, not a formal notice. It has
  no numbered schedule, no seal and no date of its own. Its wording is the scrubbed source's,
  character for character, quirks included: "Dear [Owner Name]" opens the address block as well
  as the salutation, the opening paragraph has no full stop, and the rule cited is fixed at
  "13.2 (c) 'Parking of Vehicles'". SPEC.md records what was decided beyond the source.

  Where the source's text has one placeholder standing for several facts, the facts are separate
  fields so the screenshot reader can fill what it sees and the rest stay required: the source's
  "[Suburb, State, Postcode]" is three fields, and the reader supplies only the suburb.

  Spacing is Word's, not the first template's. The source's `docDefaults` give every paragraph
  `w:after` 160 tw and `w:line` 278 (1.158 lines), so paragraphs are separated by 8 pt of space
  rather than by empty paragraphs, and lines sit 1.158 times further apart than a single-spaced
  line. Every conditional piece of wording is in `build()`.
*/

import { formatLongMonth, todayInCanberra } from '../format.js';
import { SIZE, leading, tw } from '../pdf/geometry.js';
import { clean, forFilename, valueRun } from './helpers.js';

/** `w:line` 278 over the 240 that means single spacing (docDefaults). */
const LINE_SPACING = 278 / 240;

/** `w:after` 160 tw (docDefaults): the space under every paragraph. */
const PARA_AFTER = tw(160);

/** A whole empty paragraph: one line at the source's spacing, plus the space after it. */
const EMPTY_PARAGRAPH = leading(SIZE.body) * LINE_SPACING + PARA_AFTER;

/** The one numbered paragraph: numId 2, level 0 (`w:ind` left 720, hanging 360 tw), so the marker at 18 pt and the text at 36 pt. */
const CLAUSE = { markerX: 18, x: 36 };

/**
 * The rule excerpt is an anchored picture 4599940 EMU wide (`wp:extent`), at 12700 EMU to the
 * point, centred on the margin, with a 38100 EMU (3 pt) black outline (`a:ln`). The source also
 * gives it a soft drop shadow (`a:outerShdw`), which is not reproduced: pdf-lib can't blur, and a
 * hard-edged offset copy looks worse than none.
 */
const EXCERPT = { width: 4599940 / 12700, border: 38100 / 12700 };

/**
 * The excerpt's anchor sits 81915 EMU (6.45 pt) below the top of its paragraph, which is the
 * empty one after the numbered paragraph and so also below that paragraph's `w:after`.
 */
const EXCERPT_OFFSET = 81915 / 12700;

const SECTIONS = [
  { id: 'letter', title: 'Letter' },
  { id: 'recipient', title: 'Recipient' },
  { id: 'property', title: 'Property' },
  { id: 'breach', title: 'The breach' },
  { id: 'evidence', title: 'Evidence' },
  { id: 'sender', title: 'Sender' },
];

const FIELDS = [
  {
    id: 'letterhead',
    label: 'Letterhead',
    type: 'image',
    section: 'letter',
    required: true,
    placeholder: '[Letterhead]',
    help: 'Printed across the top of every page.',
  },
  {
    id: 'ownerName',
    label: 'Owner name',
    type: 'text',
    section: 'recipient',
    required: true,
    placeholder: '[Owner Name]',
    help: 'As recorded on the roll.',
  },
  {
    id: 'ownerEmail',
    label: 'Owner email',
    type: 'email',
    section: 'recipient',
    required: true,
    placeholder: '[owner email]',
  },
  {
    id: 'pmEmail',
    label: 'Property manager email',
    type: 'email',
    section: 'recipient',
    required: false,
    help: 'If the owner has a property manager, their email is printed after the owner\'s. Leave blank if not applicable.',
  },
  {
    id: 'unitsPlanNumber',
    label: 'Units Plan number',
    type: 'text',
    section: 'property',
    required: true,
    placeholder: '[Units Plan Number]',
    help: 'Digits only, e.g. 1234.',
  },
  {
    id: 'buildingName',
    label: 'Building name',
    type: 'text',
    section: 'property',
    required: true,
    placeholder: '[Building Name]',
    help: 'Printed in single quotes.',
  },
  {
    id: 'unitNumber',
    label: 'Unit number',
    type: 'text',
    section: 'property',
    required: true,
    placeholder: '[Unit Number]',
  },
  {
    id: 'lotNumber',
    label: 'Lot number',
    type: 'text',
    section: 'property',
    required: true,
    placeholder: '[Lot Number]',
  },
  {
    id: 'streetAddress',
    label: 'Street address',
    type: 'text',
    section: 'property',
    required: true,
    placeholder: '[Street Number & Name]',
    help: 'The unit\'s street address, e.g. "45 Example Street".',
  },
  {
    id: 'suburb',
    label: 'Suburb',
    type: 'text',
    section: 'property',
    required: true,
    placeholder: '[Suburb]',
  },
  {
    id: 'state',
    label: 'State',
    type: 'text',
    section: 'property',
    required: true,
    placeholder: '[State]',
    help: 'e.g. ACT.',
  },
  {
    id: 'postcode',
    label: 'Postcode',
    type: 'text',
    section: 'property',
    required: true,
    placeholder: '[Postcode]',
  },
  {
    id: 'parkingDetails',
    label: 'More parking details (opening paragraph)',
    type: 'text',
    section: 'breach',
    required: false,
    help: 'Follows "…occupants of Unit 12/45 Example Street parking illegally". Leave blank for none.',
  },
  {
    id: 'observedDate',
    label: 'Date observed',
    type: 'date',
    section: 'breach',
    required: true,
    placeholder: '[Date]',
    help: 'The day the building manager saw the vehicle.',
  },
  {
    id: 'vehicleDescription',
    label: 'Vehicle description',
    type: 'text',
    section: 'breach',
    required: true,
    placeholder: '[Vehicle Description]',
    help: 'Completes "…observed that a ___ bearing…", e.g. "white Toyota Corolla sedan".',
  },
  {
    id: 'plateState',
    label: 'Number plate state',
    type: 'text',
    section: 'breach',
    required: true,
    placeholder: '[State]',
    help: 'The state on the number plates, e.g. NSW.',
  },
  {
    id: 'rego',
    label: 'Registration',
    type: 'text',
    section: 'breach',
    required: true,
    placeholder: '[Rego]',
    help: 'The number plate, printed in quotation marks.',
  },
  {
    id: 'observationDetails',
    label: 'More parking details (numbered paragraph)',
    type: 'text',
    section: 'breach',
    required: false,
    help: 'Follows "…was parked illegally on common property". Leave off the full stop. Leave blank for none.',
  },
  {
    id: 'ruleExcerpt',
    label: 'Image of the rule',
    type: 'image',
    section: 'breach',
    required: false,
    help: 'An excerpt of Rule 13.2, printed with a black border under the numbered paragraph.',
  },
  {
    id: 'evidence',
    label: 'Evidence of the breach',
    type: 'group',
    section: 'evidence',
    required: true,
    min: 1,
    max: 10,
    itemLabel: 'Photo',
    fields: [
      {
        id: 'image',
        label: 'Image',
        type: 'image',
        required: true,
        placeholder: '[Image/s]',
        help: 'A photo of the vehicle. Printed at the end of the letter.',
      },
    ],
  },
  {
    id: 'strataManagerName',
    label: 'Strata manager name',
    type: 'text',
    section: 'sender',
    required: true,
    placeholder: '[Strata Manager Name]',
  },
];

const FIELD_BY_ID = new Map(FIELDS.map((field) => [field.id, field]));
const EVIDENCE_IMAGE = FIELD_BY_ID.get('evidence').fields[0];

const plain = (text) => ({ text });
const bold = (text) => ({ text, bold: true });

/** A run for a top-level field's value, or its red placeholder. */
const value = (id, values, style) => valueRun(FIELD_BY_ID.get(id), values[id], style);

/** A paragraph and the space after it, as Word sets every paragraph. */
const paragraph = (runs, extra = {}) => [
  { type: 'para', runs, x: 0, align: 'left', size: SIZE.body, lineSpacing: LINE_SPACING, ...extra },
  { type: 'blank', height: PARA_AFTER },
];

const gap = (height) => ({ type: 'blank', height });

/** The building name, in the single quotes both of its places in the source put round it. */
const quotedBuilding = (values, style) => [
  { text: '‘', ...style },
  value('buildingName', values, style),
  { text: '’', ...style },
];

/** A field's text with a space before it, or nothing when it is blank (the optional details). */
const optionalAfterSpace = (id, values) => (clean(values[id]) ? [plain(` ${clean(values[id])}`)] : []);

function addressBlock(values) {
  const emails = [plain('Email to: '), value('ownerEmail', values), ...optionalAfterSpace('pmEmail', values)];
  return [
    // "Dear [Owner Name]" opens the address block in the source, without a comma, as well as
    // heading the salutation below. Reproduced as it is.
    ...paragraph([plain('Dear '), value('ownerName', values)]),
    ...paragraph([
      plain('Lot '),
      value('lotNumber', values),
      plain(', Unit '),
      value('unitNumber', values),
      plain(' of '),
      value('streetAddress', values),
    ]),
    ...paragraph([
      value('suburb', values),
      plain(' '),
      value('state', values),
      plain(' '),
      value('postcode', values),
    ]),
    ...paragraph(emails),
  ];
}

function letterBody(values) {
  const observed = valueRun(FIELD_BY_ID.get('observedDate'), formatLongMonth(values.observedDate));
  const blocks = [
    ...paragraph([
      bold('Re UP '),
      value('unitsPlanNumber', values, { bold: true }),
      bold(' '),
      ...quotedBuilding(values, { bold: true }),
      bold(' Breach of Rules – Illegal Parking'),
    ]),
    ...paragraph([plain('Dear '), value('ownerName', values), plain(',')]),
    // The source ends this paragraph without a full stop.
    ...paragraph([
      plain('We wish to bring to your attention a breach of rules involving the occupants of Unit '),
      value('unitNumber', values),
      plain('/'),
      value('streetAddress', values),
      plain(' parking illegally'),
      ...optionalAfterSpace('parkingDetails', values),
    ]),
    {
      type: 'item',
      marker: '1.',
      markerX: CLAUSE.markerX,
      x: CLAUSE.x,
      runs: [
        plain('On '),
        observed,
        plain(' the building manager observed that a '),
        value('vehicleDescription', values),
        plain(' bearing '),
        value('plateState', values),
        plain(' Number Plates “'),
        value('rego', values),
        plain('” was parked illegally on common property'),
        ...optionalAfterSpace('observationDetails', values),
        plain('. This is in breach of Owners Corporation Rules 13.2 (c) ‘Parking of Vehicles’.'),
      ],
      align: 'left',
      size: SIZE.body,
      lineSpacing: LINE_SPACING,
    },
    gap(PARA_AFTER),
  ];

  if (values.ruleExcerpt) {
    // The source reserves room for the floating picture with empty paragraphs; here the picture
    // sits in the flow, its 6.45 pt anchor offset above it and one empty paragraph's height below.
    blocks.push(
      gap(EXCERPT_OFFSET),
      {
        type: 'image',
        image: values.ruleExcerpt,
        x: 0,
        align: 'center',
        border: true,
        borderWidth: EXCERPT.border,
        maxWidth: EXCERPT.width,
      },
      gap(EMPTY_PARAGRAPH),
    );
  }
  return blocks;
}

function closing(values) {
  const blocks = [
    ...paragraph([plain('Please see evidence of the breach below.')]),
    ...paragraph([value('strataManagerName', values, { bold: true })]),
    ...paragraph([
      plain('For and on behalf of Units Plan '),
      value('unitsPlanNumber', values),
      plain(' '),
      ...quotedBuilding(values),
    ]),
  ];
  for (const item of values.evidence ?? []) {
    if (item.image) {
      blocks.push(
        // The default box (full measure, 300 pt tall) lets two portrait photos share a page.
        { type: 'image', image: item.image, x: 0 },
        gap(PARA_AFTER),
      );
    } else {
      // No photo yet: the source's own red `[Image/s]` stands in for it in the preview.
      blocks.push(...paragraph([valueRun(EVIDENCE_IMAGE, '')]));
    }
  }
  return blocks;
}

export const parkingBreachNotice = {
  id: 'parking-breach-notice',
  name: 'Parking Breach Notice',
  summary: 'A letter to an owner about a vehicle parked illegally on common property, with the rule and photos as evidence.',
  sections: SECTIONS,
  fields: FIELDS,

  /**
   * "20260921 UP9999 Parking Breach Notice - Lot 34.pdf". The letter has no date of its own, so
   * the filename carries today's, in Canberra, so the notices sort by when they were written.
   */
  filename(values, now = new Date()) {
    const date = todayInCanberra(now).replaceAll('-', '');
    return `${date} UP${forFilename(values.unitsPlanNumber)} Parking Breach Notice - Lot ${forFilename(values.lotNumber)}.pdf`;
  },

  build(values) {
    return [
      values.letterhead
        ? { type: 'letterhead', image: values.letterhead }
        : { type: 'letterhead', placeholder: FIELD_BY_ID.get('letterhead').placeholder },
      ...addressBlock(values),
      ...letterBody(values),
      ...closing(values),
    ];
  },
};
