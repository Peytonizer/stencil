/*
  The Rule Infringement Notice: Unit Titles (Management) Act 2011, s 109.

  The wording is the scrubbed source's, character for character, quirks included: the space
  before the comma in "commit an offence , and", "The Owners - Units Plan No.{UP}" with no space
  after "No.", and "Units Plan No {UP}" with no full stop. The one deliberate change is
  the source's management firm's name, replaced by "the Managing Agent". Every conditional piece
  of wording is in `build()`.
  Nothing else knows about the notice's wording.

  Where a number comes from is noted beside it. SPEC.md has the block-by-block listing this
  follows and the measurements taken from the source's XML.
*/

import { addDays, formatDate, formatShortMonth, todayInCanberra } from '../format.js';
import { SIZE, SEAL_BOX } from '../pdf/geometry.js';
import { clean, valueRun } from './helpers.js';

/*
  Indents, in points from the left margin, resolved from the source's numbering.xml (SPEC.md,
  "The source document, verified"): the marker's x, then the x the text hangs at.
*/
const CLAUSE = { markerX: 18, x: 36 }; //  numId 15, level 0 — page 1's numbered clauses
const SUB_ITEM = { markerX: 54, x: 72 }; // numId 15, level 1 — a. b. c. under clause 6
const SCHEDULE = { markerX: 0, x: 18 }; //  numId 23, level 0 — Schedule A's bold clauses
const RULE = { markerX: 36, x: 54 }; //     numId 24, level 0 — a) b) … under Schedule A clause 1
const REMEDY = { markerX: 36, x: 54 }; //   numId 22, level 1 — the four standard remedies
/** Breach details and a rule's image sit at the same x as a rule's marker. */
const RULE_BODY_X = 36;
/** Additional requests, and the whole seal block, sit at the text x of Schedule A's clauses. */
const SCHEDULE_BODY_X = 18;

/** 0 → a, 1 → b. A notice takes at most ten rules, so this never runs past j. */
const letter = (index) => String.fromCharCode(97 + index);

/**
 * **Open decision:** numId 22's abstractNum defines only level 0, but the remedies
 * use level 1, so what Word shows for their markers is uncertain and Quick Look can't render
 * page 2 to check. Built as `a.` `b.` `c.` `d.` for now. Change the style here, in one place.
 */
const remedyMarker = (index) => `${letter(index)}.`;

/** The days of grace the source gives: "7 days from day of notice". */
const CONFIRM_BY_DAYS = 7;

const SECTIONS = [
  { id: 'letter', title: 'Letter' },
  { id: 'recipient', title: 'Recipient' },
  { id: 'property', title: 'Property' },
  { id: 'schedule', title: 'Schedule A' },
  { id: 'execution', title: 'Execution' },
];

const FIELDS = [
  {
    id: 'noticeDate',
    label: 'Date of the notice',
    type: 'date',
    section: 'letter',
    required: true,
    default: () => todayInCanberra(),
    placeholder: '[Date]',
    help: 'The date the notice is issued.',
  },
  {
    id: 'letterhead',
    label: 'Letterhead',
    type: 'image',
    section: 'letter',
    required: false,
    help: 'Printed across the top of page 1.',
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
    id: 'careOf',
    label: 'Care of',
    type: 'text',
    section: 'recipient',
    required: false,
    help: 'e.g. "C/- Example Property Management". Leave blank if not applicable.',
  },
  {
    id: 'address1',
    label: 'Address line 1',
    type: 'text',
    section: 'recipient',
    required: true,
    placeholder: '[Address Line 1]',
    help: "Owner's postal address.",
  },
  { id: 'address2', label: 'Address line 2', type: 'text', section: 'recipient', required: false },
  { id: 'address3', label: 'Address line 3', type: 'text', section: 'recipient', required: false },
  {
    id: 'hasPropertyManager',
    label: 'The owner has a property manager',
    type: 'checkbox',
    section: 'recipient',
    required: false,
    default: false,
    help: 'The notice goes to the property manager, with the owner in cc.',
  },
  {
    id: 'pmEmail',
    label: 'Property manager email',
    type: 'email',
    section: 'recipient',
    required: (values) => Boolean(values.hasPropertyManager),
    showIf: (values) => Boolean(values.hasPropertyManager),
    placeholder: '[PM email]',
  },
  {
    id: 'ownerEmail',
    label: 'Owner email',
    type: 'email',
    section: 'recipient',
    required: true,
    placeholder: '[Owner email]',
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
    id: 'buildingName',
    label: 'Building name',
    type: 'text',
    section: 'property',
    required: false,
    help: 'Leave blank if the building has no name.',
  },
  {
    id: 'streetAddress',
    label: 'Street address',
    type: 'text',
    section: 'property',
    required: true,
    placeholder: '[Street Address]',
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
    id: 'rules',
    label: 'Rules contravened',
    type: 'group',
    section: 'schedule',
    required: true,
    min: 1,
    max: 10,
    itemLabel: 'Rule',
    fields: [
      {
        id: 'ruleNumber',
        label: 'Rule number',
        type: 'text',
        required: true,
        placeholder: '[Rule Number]',
        help: 'As it should read, e.g. "Rule 12".',
      },
      {
        id: 'ruleDescription',
        label: 'What the rule relates to',
        type: 'text',
        required: true,
        placeholder: '[rule description]',
        help: 'e.g. "noise". Completes "…which relates to ___."',
      },
      {
        id: 'breachDetails',
        label: 'Description of the breach',
        type: 'textarea',
        required: true,
        placeholder: '[Description of breach, time and date details]',
        help: 'Include the time and date details. Line breaks are kept.',
      },
      {
        id: 'image',
        label: 'Image of the rule',
        type: 'image',
        required: false,
        help: 'An excerpt of the rule. Printed with a black border.',
      },
    ],
  },
  {
    id: 'confirmByDate',
    label: 'Confirm actions by',
    type: 'date',
    section: 'schedule',
    required: true,
    // Follows the notice date until the user edits it by hand (the form does the following).
    default: (values) => addDays(values.noticeDate, CONFIRM_BY_DAYS),
    placeholder: '[Date]',
    help: 'Defaults to 7 days after the notice date.',
  },
  {
    id: 'additionalRequests',
    label: 'Additional requests',
    type: 'textarea',
    section: 'schedule',
    required: false,
    help: 'Any additional actions or requests. Leave blank for none.',
  },
  {
    id: 'strataManagerName',
    label: 'Strata manager name',
    type: 'text',
    section: 'execution',
    required: true,
    placeholder: '[Strata Manager Name]',
  },
  {
    id: 'seal',
    label: 'Common seal',
    type: 'image',
    section: 'execution',
    required: false,
    help: 'A JPEG or PNG of the seal.',
    warning: 'No seal added — the notice will be unsealed.',
  },
];

const FIELD_BY_ID = new Map(FIELDS.map((field) => [field.id, field]));
const RULE_FIELD_BY_ID = new Map(FIELD_BY_ID.get('rules').fields.map((field) => [field.id, field]));

const plain = (text) => ({ text });
const bold = (text) => ({ text, bold: true });

/** A run for a top-level field's value, or its red placeholder. */
const value = (id, values, style) => valueRun(FIELD_BY_ID.get(id), values[id], style);

const para = (runs, extra = {}) => ({ type: 'para', runs, x: 0, align: 'left', size: SIZE.body, ...extra });
const blank = { type: 'blank' };

/** A numbered item: the marker on the first line only, the text hanging at `x`. */
const item = (marker, position, runs, extra = {}) => ({
  type: 'item',
  marker,
  markerX: position.markerX,
  x: position.x,
  runs,
  align: 'justify',
  size: SIZE.body,
  ...extra,
});

const clause = (number, runs, extra) => item(`${number}.`, CLAUSE, runs, extra);
const subItem = (key, text) => item(`${key}.`, SUB_ITEM, [plain(text)]);
const remedy = (index, text) => item(remedyMarker(index), REMEDY, [plain(text)]);

/** A Schedule A clause heading: bold marker and bold text, kept with what follows. */
const scheduleClause = (number, text, extra) =>
  item(`${number}.`, SCHEDULE, [bold(text)], { markerBold: true, keepWithNext: true, ...extra });

const REMEDIES = [
  'That the occupiers be issued with an infringement notice.',
  'That the occupiers be advised of the Owners Corporation Rules and abide by these rules. A copy of the rules be provided to the occupier upon issuance of the breach notice.',
  'The Owners Corporation care of the Managing Agent to be advised of the course of action to be taken.',
];

function addressBlock(values) {
  const optionalLine = (id) => (clean(values[id]) ? [para([plain(clean(values[id]))])] : []);
  const emailLines = values.hasPropertyManager
    ? [
        para([plain('Sent via email: '), value('pmEmail', values)]),
        para([plain('cc: '), value('ownerEmail', values)]),
      ]
    : [para([plain('Sent via email: '), value('ownerEmail', values)])];

  return [
    para([valueRun(FIELD_BY_ID.get('noticeDate'), formatShortMonth(values.noticeDate))]),
    blank,
    para([value('ownerName', values)]),
    ...optionalLine('careOf'),
    para([value('address1', values)]),
    ...optionalLine('address2'),
    ...optionalLine('address3'),
    blank,
    ...emailLines,
    blank,
  ];
}

function pageOneClauses(values) {
  const up = () => value('unitsPlanNumber', values);
  const building = clean(values.buildingName);

  return [
    clause(1, [
      plain('It has been approved by the Executive Committee of The Owners Units Plan '),
      up(),
      plain(' to issue an infringement notice to the owner of Unit '),
      value('unitNumber', values),
      plain(' (Lot '),
      value('lotNumber', values),
      plain(') of UP '),
      up(),
      plain(`${building ? `, ${building}` : ''}.`),
    ]),
    blank,
    // Left-aligned in the source, confirmed by its render; reproduced as it is.
    clause(
      2,
      [
        value('ownerName', values),
        plain(" is recorded in the Corporation's records as being the Owner of Lot "),
        value('lotNumber', values),
        plain(' being '),
        value('unitNumber', values),
        plain(' '),
        value('streetAddress', values),
        plain(', '),
        value('suburb', values),
        plain(' in Units Plan No '),
        up(),
        plain('.'),
      ],
      { align: 'left' },
    ),
    blank,
    clause(3, [
      plain(
        'With reference to Section 107 of the Unit Titles (Management) Act 2011, the Owner and Occupiers of the unit are bound by the rules of the Corporation and those reflected in the Unit Titles (Management) Act 2011.',
      ),
    ]),
    blank,
    clause(4, [
      plain(
        'The Owners Corporation believes that the Owner and/or the Occupiers of the unit are in breach of the Owners Corporation Rules and/or those reflected in the Unit Titles (Management) Act 2011 and detailed in Schedule A of this Notice.',
      ),
    ]),
    blank,
    clause(5, [
      plain(
        'Please take note that the Owner and Occupiers are bound by the provisions of the Unit Titles (Management) Act 2011 and that pursuant to Section 109 of that Act, you are hereby given notice to remedy the breach.',
      ),
    ]),
    blank,
    clause(6, [plain('Should the Owner or Occupiers not comply with this notice -')]),
    subItem('a', 'the Owner/Occupiers commit an offence , and'),
    subItem(
      'b',
      'the Owners Corporation may, without further notice, apply to the ACAT (ACT Civil and Administrative Tribunal) for an order in relation to the failure to comply with the notice.',
    ),
    subItem(
      'c',
      'Pursuant to Section 31 of the Unit Titles (Management) Act 2011, the Owners Corporation will recover all expenditure incurred in pursuing rectification of the rules breached, from the Owner/s of the unit.',
    ),
    blank,
  ];
}

function ruleBlocks(rule, index) {
  const ruleField = (id, style) => valueRun(RULE_FIELD_BY_ID.get(id), rule[id], style);
  const blocks = [
    item(`${letter(index)})`, RULE, [
      ruleField('ruleNumber'),
      plain(', which relates to '),
      ruleField('ruleDescription'),
      plain('.'),
    ]),
    blank,
    // The user's line breaks are kept; layout treats a newline in a run as a hard break.
    para([ruleField('breachDetails', { italic: true })], { x: RULE_BODY_X, align: 'justify' }),
    blank,
  ];
  if (rule.image) {
    blocks.push({ type: 'image', image: rule.image, x: RULE_BODY_X, border: true }, blank);
  }
  return blocks;
}

function scheduleA(values) {
  const blocks = [
    // 11.5 pt, not 12: the source's `w:sz 23`.
    para([bold('SCHEDULE A')], { size: SIZE.scheduleHeading, keepWithNext: true }),
    blank,
    scheduleClause(1, 'The Owners Corporation believes that the following rules have been contravened:', {
      align: 'left',
    }),
    blank,
  ];
  for (const [index, rule] of (values.rules ?? []).entries()) blocks.push(...ruleBlocks(rule, index));
  blocks.push(blank);

  blocks.push(
    scheduleClause(
      2,
      'The Owners Corporation requests that the contravention be remedied with immediate effect as follows:',
    ),
    // The source's empty numbered paragraph, which renders as a blank line.
    blank,
  );
  for (const [index, text] of REMEDIES.entries()) blocks.push(remedy(index, text));
  // Remedy (d) has no full stop in the source.
  blocks.push(
    item(remedyMarker(REMEDIES.length), REMEDY, [
      plain(
        'The Owners Corporation care of the Managing Agent to be provided with confirmation of the aforementioned actions by close of business on ',
      ),
      valueRun(FIELD_BY_ID.get('confirmByDate'), formatDate(values.confirmByDate)),
    ]),
  );
  blocks.push(
    scheduleClause(3, 'The Owners Corporation requests that the contravention of these rules not be repeated.', {
      align: 'left',
    }),
    blank,
  );

  const additional = clean(values.additionalRequests);
  if (additional) {
    blocks.push(para([plain(additional)], { x: SCHEDULE_BODY_X }), blank);
  }
  return blocks;
}

function sealBlock(values) {
  const at = { x: SCHEDULE_BODY_X };
  const blocks = [
    para([plain('The Common Seal of')], at),
    para([plain('The Owners - Units Plan No.'), value('unitsPlanNumber', values)], at),
    para([plain('was hereunto affixed in the presence of:')], at),
    blank,
    para([value('strataManagerName', values), plain(' (Authorised Agent)')], at),
    blank,
  ];
  if (values.seal) {
    blocks.push({
      type: 'image',
      image: values.seal,
      x: SCHEDULE_BODY_X,
      maxWidth: SEAL_BOX.width,
      maxHeight: SEAL_BOX.height,
    });
  }
  // Kept together so the seal is never stranded on a page of its own.
  return { type: 'keep', blocks };
}

/** Characters a filename can't carry on Windows or macOS become hyphens. */
const forFilename = (text) => clean(text).replace(/[\\/:*?"<>|\p{Cc}]/gu, '-');

export const infringementNotice = {
  id: 'infringement-notice',
  name: 'Rule Infringement Notice',
  summary: 'Unit Titles (Management) Act 2011, s 109. Notifies an owner of a rule breach and the remedies required.',
  sections: SECTIONS,
  fields: FIELDS,

  filename(values) {
    return `Rule Infringement Notice - UP ${forFilename(values.unitsPlanNumber)} Unit ${forFilename(values.unitNumber)} - ${clean(values.noticeDate)}.pdf`;
  },

  build(values) {
    return [
      ...(values.letterhead ? [{ type: 'letterhead', image: values.letterhead }] : []),
      ...addressBlock(values),
      para([bold('RULE INFRINGEMENT NOTICE')]),
      para([bold('Pursuant to Section 109 of the Unit Titles (Management) Act 2011')]),
      blank,
      para([bold('Please be advised of the following:')]),
      blank,
      ...pageOneClauses(values),
      ...scheduleA(values),
      sealBlock(values),
    ];
  },
};
