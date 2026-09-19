import { PDFDocument, StandardFonts } from 'pdf-lib';

/** Real Helvetica metrics, the same fonts render.js uses. */
export async function loadFonts() {
  const pdf = await PDFDocument.create();
  return {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
}

export const text = (t, style = {}) => ({ text: t, ...style });
export const para = (runs, extra = {}) => ({ type: 'para', runs, x: 0, align: 'left', size: 12, ...extra });
export const fakeImage = (width, height) => ({ bytes: new Uint8Array(), type: 'png', width, height });

/** A paragraph long enough to wrap onto several lines at the full measure. */
export const LOREM =
  'The Owners Corporation believes that the Owner and/or the Occupiers of the unit are in breach of the Owners Corporation Rules and detailed in Schedule A of this Notice. ';
