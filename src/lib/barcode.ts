/**
 * Picks the price out of a scanned QR code or barcode.
 *
 * Most barcodes (EAN-13 of a packaged product) only identify the product and carry no price —
 * those yield no candidates. Two kinds do carry one:
 *  - EAN-13 starting with "2" is a variable-measure code, printed by store scales (hortifruti,
 *    açougue, padaria): product code, then the value in cents, then the check digit.
 *  - QR codes and text barcodes may hold a price as text or in a URL ("...?preco=24,90").
 */

import { readPriceTag, type OcrLine, type TagReading } from '@/lib/price-tag';

const EMBEDDED_VALUE_DIGITS = 5;

export function readBarcode(type: string, data: string): TagReading {
  const embedded = type === 'ean13' ? readVariableMeasureEan13(data) : null;
  if (embedded !== null) {
    return { candidates: [{ cents: embedded, kind: 'regular', size: 1, score: 100 }] };
  }
  return readPriceTag(textLines(data));
}

/** Scale labels put the price in the 5 digits before the check digit: 2 CCCCCC VVVVV D. */
function readVariableMeasureEan13(data: string): number | null {
  if (!/^2\d{12}$/.test(data) || !hasValidCheckDigit(data)) return null;
  const cents = parseInt(data.slice(12 - EMBEDDED_VALUE_DIGITS, 12), 10);
  return cents > 0 ? cents : null;
}

function hasValidCheckDigit(ean13: string): boolean {
  const digits = [...ean13].map(Number);
  const sum = digits
    .slice(0, 12)
    .reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

/** Splits the payload into lines for the tag reader; the frames are equal, so only text counts. */
function textLines(data: string): OcrLine[] {
  let text = data;
  try {
    text = decodeURIComponent(data.replace(/\+/g, ' '));
  } catch {
    // Not URL-encoded (or malformed): read it as is.
  }
  const frame = { left: 0, top: 0, right: 10, bottom: 10 };
  return text
    .split(/[\n\r&;|?]+/)
    .map((line) => line.replace(/=/g, ' ').trim())
    .filter(Boolean)
    .map((line) => ({ text: line, frame }));
}
