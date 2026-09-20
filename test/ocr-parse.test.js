import { describe, expect, it } from 'vitest';
import { parseLotOwner } from '../src/ocr/parse.js';

/** A word box, 10 px tall and 6 px per letter, the scale of the Lot/Owner screen at 1x. */
const w = (text, x, y, confidence = 95) => ({
  text,
  bbox: { x0: x, y0: y, x1: x + text.length * 6, y1: y + 10 },
  confidence,
});

/** The screen's layout at 1x (positions from a real capture; values are made up). The right-hand
 *  panel sits a few pixels off the left column's baselines, as it does on the real screen. */
const screen = (over = {}) => [
  w('U/Plan*', 14, 63),
  w('1234', 104, 63),
  w('Owner', 446, 69),
  w('Name', 482, 69),
  w('Jane', 535, 69),
  w('Citizen', 565, 69),

  w('Lot*', 82, 92),
  w('12', 113, 92),
  w('Unit', 174, 92),
  w('3', 206, 92),
  w('Street', 270, 92),
  w('No', 310, 92),
  w('45', 335, 92),
  w('(Ah)', 446, 98),
  w('Email', 713, 98),
  w('jane@example.com', 790, 98),

  w('Street', 14, 118),
  w('Name*', 54, 118),
  w('Example', 104, 118),
  w('Street', 150, 118),
  w('(Bh)', 446, 124),
  w('Salutation', 714, 124),

  w('Suburb*', 14, 139),
  w('Canberra', 104, 139),
  w('Mobile', 446, 142),

  w('Accessory', 13, 169),
  w('Unit', 82, 169),
  w('UOE*', 14, 194),
  w('174', 110, 194),
  w('CRN', 13, 220),
  ...(over.extra ?? []),
];

/** The U/Plan row with `texts` as its value, one word after another. */
const planRow = (words, ...texts) => {
  let x = 104;
  const value = texts.map((text) => {
    const word = w(text, x, 63);
    x += text.length * 6 + 6;
    return word;
  });
  return [...words.filter((word) => !(word.bbox.y0 === 63 && word.bbox.x0 >= 104)), ...value];
};

const without = (words, ...texts) => words.filter((word) => !texts.includes(word.text));

describe('parseLotOwner', () => {
  it('reads every field from a clean capture', () => {
    const { fields, unread, notFound } = parseLotOwner(screen());
    const values = Object.fromEntries(Object.entries(fields).map(([id, f]) => [id, f.value]));
    expect(values).toEqual({
      unitsPlanNumber: '1234',
      ownerName: 'Jane Citizen',
      lotNumber: '12',
      unitNumber: '3',
      ownerEmail: 'jane@example.com',
      streetAddress: '45 Example Street',
      suburb: 'Canberra',
    });
    expect(unread).toEqual([]);
    expect(notFound).toEqual([]);
  });

  it('does not take the Accessory Unit label for Unit, or its blank box for a value', () => {
    // Drop the real Unit label and value: only "Accessory Unit" is left.
    const { fields, notFound } = parseLotOwner(without(screen(), '3').filter((x) => x.bbox.x0 !== 174));
    expect(fields.unitNumber).toBeUndefined();
    expect(notFound).toContain('Unit');
  });

  it('ends a value at the next label rather than running into the Owner Info panel', () => {
    const { fields } = parseLotOwner(screen());
    expect(fields.suburb.value).toBe('Canberra');
  });

  it('reports a label it could not find as not found, not as blank', () => {
    const { fields, notFound } = parseLotOwner(without(screen(), 'Lot*'));
    expect(fields.lotNumber).toBeUndefined();
    expect(notFound).toEqual(['Lot']);
  });

  it('forgives one slip in a long label but not in a short one', () => {
    const slipped = screen().map((word) => (word.text === 'Suburb*' ? { ...word, text: 'Subnrb*' } : word));
    expect(parseLotOwner(slipped).fields.suburb.value).toBe('Canberra');

    const short = screen().map((word) => (word.text === 'Lot*' ? { ...word, text: 'Lorg' } : word));
    expect(parseLotOwner(short).notFound).toEqual(['Lot']);
  });

  it('lists a box with nothing usable in it as unread', () => {
    const { fields, unread } = parseLotOwner(without(screen(), 'Canberra'));
    expect(fields.suburb).toBeUndefined();
    expect(unread).toEqual(['Suburb']);
  });

  it('drops an email that is not shaped like one', () => {
    const garbled = screen().map((word) =>
      word.text === 'jane@example.com' ? { ...word, text: 'jane@examplecom' } : word,
    );
    const { fields, unread } = parseLotOwner(garbled);
    expect(fields.ownerEmail).toBeUndefined();
    expect(unread).toEqual(['Email']);
  });

  it('does not keep the tail of an email that was split into two words', () => {
    // Seen from a real run: "jane.citizen@example.com" came back as "jane" and
    // "citizen@example.com", both at under 10% confidence.
    const split = screen().flatMap((word) =>
      word.text === 'jane@example.com'
        ? [w('jane', 790, 98, 9), w('citizen@example.com', 817, 98, 9)]
        : [word],
    );
    const { fields, unread } = parseLotOwner(split);
    expect(fields.ownerEmail).toBeUndefined();
    expect(unread).toEqual(['Email']);
  });

  it('keeps the digits of a plan box that holds more than the number', () => {
    const plan = screen().map((word) => (word.text === '1234' ? { ...word, text: 'UP1234' } : word));
    expect(parseLotOwner(plan).fields.unitsPlanNumber.value).toBe('1234');
  });

  it('builds the street address from the name alone, with a note, when there is no number', () => {
    const { fields, unread } = parseLotOwner(without(screen(), '45'));
    expect(fields.streetAddress.value).toBe('Example Street');
    expect(fields.streetAddress.note).toMatch(/street number/i);
    expect(unread).toEqual(['Street No']);
  });

  it("reports the lowest word confidence that went into a value", () => {
    const shaky = screen().map((word) =>
      word.text === 'Citizen' ? { ...word, confidence: 61 } : word,
    );
    expect(parseLotOwner(shaky).fields.ownerName.confidence).toBe(61);
    expect(parseLotOwner(shaky).fields.suburb.confidence).toBe(95);
  });

  it('does not fill a value the reader was mostly guessing at', () => {
    const noise = screen().map((word) => (word.text === 'Canberra' ? { ...word, confidence: 20 } : word));
    const { fields, unread } = parseLotOwner(noise);
    expect(fields.suburb).toBeUndefined();
    expect(unread).toEqual(['Suburb']);
    // Unsure but not noise: filled, with its confidence for the form to flag.
    const unsure = screen().map((word) => (word.text === 'Canberra' ? { ...word, confidence: 55 } : word));
    expect(parseLotOwner(unsure).fields.suburb).toEqual({ value: 'Canberra', confidence: 55 });
  });

  describe('the U/Plan box', () => {
    it('takes the plan number and the building name and ignores the address', () => {
      const words = planRow(screen(), '1234', 'EXAMPLE', 'APARTMENTS', '45', 'EXAMPLE', 'ST');
      const { fields } = parseLotOwner(words);
      expect(fields.unitsPlanNumber.value).toBe('1234');
      expect(fields.buildingName.value).toBe('EXAMPLE APARTMENTS');
      expect(fields.buildingName.note).toMatch(/check where the name ends/i);
      // The address comes from Street No and Street Name, not from this box.
      expect(fields.streetAddress.value).toBe('45 Example Street');
    });

    it('finds the end of the name by the street when the address has no number', () => {
      // The building shares its street's first word, so the cut is at the second "Example".
      const words = planRow(screen(), '1234', 'EXAMPLE', 'APARTMENTS', 'EXAMPLE', 'STREET', 'CANBERRA');
      expect(parseLotOwner(words).fields.buildingName.value).toBe('EXAMPLE APARTMENTS');
    });

    it('leaves the building name out when the box holds only the plan number', () => {
      expect(parseLotOwner(screen()).fields.buildingName).toBeUndefined();
    });

    it('drops a building name it was unsure of, but keeps the plan number', () => {
      const words = planRow(screen(), '1234', 'EXAMPLE', 'APARTMENTS', '45').map((word) =>
        word.text === 'APARTMENTS' ? Object.assign(word, { confidence: 30 }) : word,
      );
      const { fields } = parseLotOwner(words);
      expect(fields.unitsPlanNumber.value).toBe('1234');
      expect(fields.buildingName).toBeUndefined();
    });
  });

  describe('short values read a second time', () => {
    const shaky = (text, confidence) =>
      screen().map((word) => (word.text === text ? Object.assign(word, { confidence }) : word));

    it('reports where each short value is', () => {
      const { regions } = parseLotOwner(screen());
      expect(Object.keys(regions).toSorted()).toEqual(['lotNumber', 'streetNumber', 'unitNumber']);
      // Around the word "12", at x 113 to 125 and y 92 to 102.
      expect(regions.lotNumber).toEqual({ x0: 113, x1: 125, y0: 92, y1: 102 });
    });

    it('fills a value the first pass was too unsure of when the reread is surer', () => {
      const words = shaky('45', 18);
      expect(parseLotOwner(words).fields.streetAddress.value).toBe('Example Street');
      const again = parseLotOwner(words, { streetNumber: { text: '45', confidence: 61 } });
      expect(again.fields.streetAddress.value).toBe('45 Example Street');
      expect(again.fields.streetAddress.confidence).toBe(61);
    });

    it('prefers the reread only if it scored at least as well', () => {
      const words = shaky('12', 70);
      const worse = parseLotOwner(words, { lotNumber: { text: '17', confidence: 60 } });
      expect(worse.fields.lotNumber.value).toBe('12');
      const better = parseLotOwner(words, { lotNumber: { text: '17', confidence: 90 } });
      expect(better.fields.lotNumber.value).toBe('17');
    });

    it('ignores a reread that is not a plausible value', () => {
      const words = shaky('12', 70);
      const junk = parseLotOwner(words, { lotNumber: { text: '|', confidence: 99 } });
      expect(junk.fields.lotNumber.value).toBe('12');
    });

    it('looks to the right of the label for a box in which nothing was found', () => {
      const { regions, fields } = parseLotOwner(without(screen(), '12'));
      expect(fields.lotNumber).toBeUndefined();
      // Lot* ends at x 106; the next label, Unit, begins at 174, so the reach is capped at 50.
      expect(regions.lotNumber.x0).toBe(106);
      expect(regions.lotNumber.x1).toBe(156);
      // A reread of that stretch can fill it.
      const again = parseLotOwner(without(screen(), '12'), { lotNumber: { text: '12', confidence: 88 } });
      expect(again.fields.lotNumber.value).toBe('12');
    });
  });

  describe('a lot number printed against its label', () => {
    // Seen on the real screen: the asterisk touches the box and the value starts at its edge.
    const fuse = (words, fused) =>
      words.flatMap((word) => {
        if (word.text === 'Lot*') return [w(fused, 82, 92)];
        return word.text === '12' && word.bbox.x0 === 113 ? [] : [word];
      });

    it('is split out of a word the reader ran together', () => {
      expect(parseLotOwner(fuse(screen(), 'Lot*12')).fields.lotNumber.value).toBe('12');
      expect(parseLotOwner(fuse(screen(), "Lot*'4")).fields.lotNumber.value).toBe('4');
    });

    it('is cleaned of box borders left on its edges', () => {
      const bordered = screen().map((word) => (word.text === '12' ? { ...word, text: '|12|' } : word));
      expect(parseLotOwner(bordered).fields.lotNumber.value).toBe('12');
    });

    it('does not turn a word that merely starts with "Lot" into a label and a value', () => {
      const { fields } = parseLotOwner(fuse(screen(), 'Lotus'));
      expect(fields.lotNumber).toBeUndefined();
    });
  });

  it('returns nothing for an image with no words', () => {
    expect(parseLotOwner([])).toEqual({
      fields: {},
      unread: [],
      notFound: ['U/Plan', 'Lot', 'Unit', 'Street No', 'Street Name', 'Suburb', 'Owner Name', 'Email'],
      regions: {},
    });
  });
});
