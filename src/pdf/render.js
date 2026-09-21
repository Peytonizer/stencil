/*
  Builds the PDF.

  One entry point, `buildPdf(template, values)`, returning the bytes of a finished document.
  The same bytes are shown in the preview and handed to the download, so what you look at is
  what you send — there is no second renderer to disagree with the first.

  Fonts are the PDF standard 14 Helvetica family. Nothing is embedded, so the output stays a
  few kilobytes plus any images, and no font licence rides along in a document that gets
  emailed to owners. The source uses Aptos, which can't be embedded; Helvetica is the nearest
  standard sans.
*/

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { layoutBlocks } from './layout.js';
import { PAGE } from './geometry.js';

export async function buildPdf(template, values) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(template.name);
  pdf.setProducer('stencil');
  pdf.setCreator('stencil');

  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };

  const pages = layoutBlocks(template.build(values), fonts);

  // An image used twice (a letterhead repeated, say) is embedded once.
  const images = [...new Set(pages.flatMap(({ ops }) => ops.filter((op) => op.image).map((op) => op.image)))];
  const embedded = new Map(
    await Promise.all(
      images.map(async (image) => [
        image,
        image.type === 'png' ? await pdf.embedPng(image.bytes) : await pdf.embedJpg(image.bytes),
      ]),
    ),
  );

  for (const { ops } of pages) {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    for (const op of ops) {
      if (op.op === 'text') {
        if (op.text === '') continue;
        page.drawText(op.text, {
          x: op.x,
          y: op.y,
          size: op.size,
          font: fonts[op.font],
          ...(op.color && { color: rgb(op.color.r, op.color.g, op.color.b) }),
        });
      } else if (op.op === 'image') {
        page.drawImage(embedded.get(op.image), {
          x: op.x,
          y: op.y,
          width: op.width,
          height: op.height,
        });
        if (op.border) {
          // A black rule on the image's own edge, as the source draws round a rule excerpt: 1 pt
          // unless the block says otherwise (the parking notice's excerpt is 3 pt).
          page.drawRectangle({
            x: op.x,
            y: op.y,
            width: op.width,
            height: op.height,
            borderColor: rgb(0, 0, 0),
            borderWidth: op.borderWidth,
          });
        }
      }
    }
  }

  return pdf.save();
}
