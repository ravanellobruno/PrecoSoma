/**
 * Picks the price to pay out of the text recognized (OCR) on a price tag.
 *
 * A single tag usually carries several numbers — old price, promotional price, price per kg,
 * barcode, dates — so every price-like value becomes a candidate, classified by the words
 * around it ("De", "Por", "Clube", "/kg"...) and ranked by kind and font size (the price to
 * pay is usually the biggest number). The user always confirms the choice.
 */

export type Rect = { left: number; top: number; right: number; bottom: number };

export type OcrLine = {
  text: string;
  frame: Rect;
  /** Words of the line; used to measure the digits' height and to spot superscript cents. */
  elements?: { text: string; frame: Rect }[];
};

export type PriceKind = 'promo' | 'member' | 'regular' | 'old' | 'unit';

export type PriceCandidate = {
  cents: number;
  kind: PriceKind;
  /** Unit of a per-unit price ("kg", "l", "100g"...). */
  unit?: string;
  /** Height of the digits, in the units of the image the text was read from. */
  size: number;
  score: number;
};

export type TagReading = {
  /** Most likely first. */
  candidates: PriceCandidate[];
};

const MAX_CANDIDATES = 5;
const MAX_CENTS = 9_999_999;

const KIND_BONUS: Record<PriceKind, number> = {
  promo: 25,
  member: 10,
  regular: 0,
  old: -60,
  unit: -80,
};

// Patterns run on normalized text: lowercase, no accents.
const UNIT = String.raw`(?:100\s?g|100\s?ml|kg|g|ml|lt|litro|l|un|und|unid|unidade|m|cm|dz|duzia)`;
const PRICE_RE = /(^|[^\d])(\d{1,3}(?:\.\d{3})+|\d{1,5}) ?[,.] ?(\d{2})(?!\d)/g;
/** "4,98/kg", "4,98 por kg" right after the value. */
const UNIT_SUFFIX_RE = new RegExp(String.raw`^\s*(?:\/|por|p\/)\s*(${UNIT})\b`);
/** "1,25 kg": a measure (weight, volume), not a price. */
const MEASURE_SUFFIX_RE = new RegExp(String.raw`^\s*${UNIT}\b`);
/** "R$/kg", "preço por kg", "preço do kg" in the label before the value. */
const UNIT_LABEL_RE = new RegExp(
  String.raw`(?:\/|por|p\/|do|da)\s*(${UNIT})\b|r\$\s*\/\s*(${UNIT})\b`,
);

const NOISE_RES = [
  /\d(?: ?\d){7,}/g, // barcodes / product codes
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, // dates
  /[-+]?\d+(?:[.,]\d+)? ?%/g, // discounts
  /\b\d{1,2} ?h ?\d{2}\b/g, // times
];

const OLD_TAIL_RE = /\b(?:de|antes|era)$/;
const PROMO_TAIL_RE = /\b(?:por|agora|so|apenas)$/;
const KEYWORDS: [PriceKind, RegExp][] = [
  ['promo', /\b(?:oferta|promo|promocao|promocional|desconto|liquida|baixou)\b/g],
  ['member', /\b(?:clube|cartao|socio|fidelidade|assinante|app|cadastrad[oa])\b/g],
  ['regular', /\bpreco (?:normal|regular)\b/g],
];

type Candidate = Omit<PriceCandidate, 'size'> & { line: OcrLine };

/**
 * Combines readings of the same tag taken from OCR runs at different image scales: large
 * display digits are only recognized at some scales, small print at others. Candidates are
 * re-ranked together, so their `size` must be comparable across readings (relative to the
 * image they came from).
 */
export function mergeReadings(readings: TagReading[]): TagReading {
  const all = readings.flatMap((reading) => reading.candidates);
  const maxSize = Math.max(0, ...all.map((candidate) => candidate.size));

  const best = new Map<number, PriceCandidate>();
  for (const candidate of all) {
    const score = Math.round((candidate.size / maxSize) * 100) + KIND_BONUS[candidate.kind];
    const known = best.get(candidate.cents);
    if (!known || score > known.score) best.set(candidate.cents, { ...candidate, score });
  }
  return {
    candidates: [...best.values()].sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES),
  };
}

export function readPriceTag(recognized: OcrLine[]): TagReading {
  // Vertical text (side labels, rotated prices) is not the price to pay.
  const lines = recognized.filter((line) => !isVertical(line));
  const found: Candidate[] = [];
  const priceLines = new Set<OcrLine>();

  for (const line of lines) {
    const inLine = findPrices(line);
    if (inLine.length > 0) priceLines.add(line);
    found.push(...inLine);
  }
  const split = [
    ...findSuperscriptPrices(lines, priceLines),
    ...findGluedCentsPrices(lines, priceLines),
  ];
  for (const merged of split) {
    priceLines.add(merged.line);
    found.push(merged);
  }

  // Words around the value are often on their own line: "De:" to the left, "OFERTA" above.
  for (const candidate of found) {
    if (candidate.kind !== 'regular') continue;
    const labels = lines
      .filter((line) => !priceLines.has(line) && isLabelFor(line.frame, candidate.line.frame))
      .map((line) => normalize(line.text))
      .join(' ');
    if (labels) Object.assign(candidate, classify(labels, ''));
  }

  // Next to a crossed-out "De" price, a lower unlabeled price is the promotion.
  const oldPrice = Math.max(0, ...found.filter((c) => c.kind === 'old').map((c) => c.cents));
  for (const candidate of found) {
    if (candidate.kind === 'regular' && candidate.cents < oldPrice) candidate.kind = 'promo';
  }

  const maxHeight = Math.max(0, ...found.map((c) => c.score));
  const ranked = found
    .map(({ line: _line, ...candidate }) => ({
      ...candidate,
      size: candidate.score,
      score: Math.round((candidate.score / maxHeight) * 100) + KIND_BONUS[candidate.kind],
    }))
    .sort((a, b) => b.score - a.score);

  const candidates: PriceCandidate[] = [];
  for (const candidate of ranked) {
    if (candidates.some((c) => c.cents === candidate.cents)) continue;
    candidates.push(candidate);
    if (candidates.length === MAX_CANDIDATES) break;
  }

  return { candidates };
}

/** Prices written on one line. `score` holds the digits' height until ranking. */
function findPrices(line: OcrLine): Candidate[] {
  const text = removeNoise(normalize(line.text));
  const height = digitHeight(line);
  const found: Candidate[] = [];
  let labelStart = 0;

  for (const match of text.matchAll(PRICE_RE)) {
    const start = match.index + match[1].length;
    const end = match.index + match[0].length;
    const after = text.slice(end);
    if (!UNIT_SUFFIX_RE.test(after) && MEASURE_SUFFIX_RE.test(after)) continue;

    const cents = parseInt(match[2].replace(/\./g, ''), 10) * 100 + parseInt(match[3], 10);
    if (cents > 0 && cents <= MAX_CENTS) {
      // Only the text since the previous price labels this one: "De 29,90 Por 24,90".
      const label = text.slice(labelStart, start);
      found.push({ cents, ...classify(label, after), score: height, line });
    }
    labelStart = end;
  }
  return found;
}

/**
 * Tags often print the cents small and raised next to the reais ("24" + "90"), which OCR
 * reads as separate words or lines.
 */
function findSuperscriptPrices(lines: OcrLine[], priceLines: Set<OcrLine>): Candidate[] {
  const words = lines.flatMap((line) =>
    priceLines.has(line) ? [] : (line.elements ?? [line]).map((word) => ({ ...word, line })),
  );
  const found: Candidate[] = [];

  for (const reais of words) {
    const reaisMatch = /^(?:r\$)?(\d{1,4})$/.exec(normalize(reais.text).replace(/\s/g, ''));
    if (!reaisMatch) continue;
    const height = reais.frame.bottom - reais.frame.top;

    const cents = words.find((word) => {
      if (word === reais || !/^[,.]?\d{2}$/.test(word.text.trim())) return false;
      const { frame } = word;
      return (
        frame.bottom - frame.top < height * 0.8 &&
        frame.left >= reais.frame.right - height * 0.2 &&
        frame.left - reais.frame.right < height &&
        frame.top < reais.frame.top + height * 0.5 &&
        frame.bottom > reais.frame.top - height * 0.3
      );
    });
    if (!cents) continue;

    const value = parseInt(reaisMatch[1], 10) * 100 + parseInt(cents.text.replace(/\D/g, ''), 10);
    if (value <= 0) continue;
    const line = {
      text: `${reaisMatch[1]},${cents.text.replace(/\D/g, '')}`,
      frame: reais.frame,
    };
    const own = normalize(reais.line.text);
    const before = own.slice(0, Math.max(0, own.indexOf(reaisMatch[1])));
    found.push({ cents: value, ...classify(before, ''), score: height, line });
  }
  return found;
}

/**
 * Big-reais tags ("R$ 8" with small ",99" beside it) where OCR glues "R$" to the cents ("R$99")
 * and reads the reais as a line of its own, sitting inside the glued line's box.
 */
function findGluedCentsPrices(lines: OcrLine[], priceLines: Set<OcrLine>): Candidate[] {
  const found: Candidate[] = [];

  for (const glued of lines) {
    if (priceLines.has(glued)) continue;
    const centsMatch = /^r\$ ?(\d{2})$/.exec(normalize(glued.text));
    if (!centsMatch) continue;

    const reais = lines.find((line) => {
      if (line === glued || priceLines.has(line) || !/^\d{1,4}$/.test(line.text.trim()))
        return false;
      const { frame } = line;
      return (
        center(frame).x >= glued.frame.left &&
        center(frame).x <= glued.frame.right &&
        frame.top < glued.frame.bottom &&
        frame.bottom > glued.frame.top
      );
    });
    if (!reais) continue;

    const value = parseInt(reais.text, 10) * 100 + parseInt(centsMatch[1], 10);
    if (value <= 0) continue;
    const line = {
      text: `${reais.text.trim()},${centsMatch[1]}`,
      frame: reais.frame,
    };
    found.push({
      cents: value,
      kind: 'regular',
      score: reais.frame.bottom - reais.frame.top,
      line,
    });
  }
  return found;
}

function classify(label: string, after: string): { kind: PriceKind; unit?: string } {
  const unitAfter = UNIT_SUFFIX_RE.exec(after);
  if (unitAfter) return { kind: 'unit', unit: cleanUnit(unitAfter[1]) };
  const unitBefore = UNIT_LABEL_RE.exec(label);
  if (unitBefore) return { kind: 'unit', unit: cleanUnit(unitBefore[1] ?? unitBefore[2]) };

  // A word right before the value wins: "De: R$" / "Por".
  const tail = label.replace(/[\s:.\-]*(?:r\$)?[\s:.\-]*$/, '');
  if (OLD_TAIL_RE.test(tail)) return { kind: 'old' };
  if (PROMO_TAIL_RE.test(tail)) return { kind: 'promo' };

  // Otherwise, the keyword closest to the value.
  let best: { kind: PriceKind; index: number } | null = null;
  for (const [kind, re] of KEYWORDS) {
    for (const match of label.matchAll(re)) {
      if (!best || match.index > best.index) best = { kind, index: match.index };
    }
  }
  return { kind: best?.kind ?? 'regular' };
}

/** A label line sits right above the value, or to its left on the same row. */
function isLabelFor(label: Rect, value: Rect): boolean {
  const height = value.bottom - value.top;
  const overlapsX = label.left < value.right && label.right > value.left;
  const above =
    overlapsX && value.top - label.bottom > -height * 0.3 && value.top - label.bottom < height;
  const rowOffset = Math.abs(center(label).y - center(value).y);
  const left = label.right <= value.left + height * 0.3 && value.left - label.right < height * 3;
  return above || (left && rowOffset < height * 0.6);
}

/**
 * Text running up or down: its box is much taller than wide. Needs a few characters, since a
 * lone digit is naturally taller than wide.
 */
function isVertical(line: OcrLine): boolean {
  const { frame } = line;
  const characters = line.text.replace(/\s/g, '').length;
  return characters >= 3 && frame.bottom - frame.top > (frame.right - frame.left) * 1.5;
}

function digitHeight(line: OcrLine): number {
  const digits = (line.elements ?? []).filter((word) => /\d/.test(word.text));
  const frames = digits.length > 0 ? digits.map((word) => word.frame) : [line.frame];
  return Math.max(...frames.map((frame) => frame.bottom - frame.top));
}

function normalize(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // Common OCR confusions inside numbers: "24,9O" -> "24,90".
      .replace(/(\d)o(?=\d|\b)/g, (_, digit: string) => `${digit}0`)
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function removeNoise(text: string): string {
  return NOISE_RES.reduce((acc, re) => acc.replace(re, (match) => ' '.repeat(match.length)), text);
}

function cleanUnit(unit: string): string {
  const compact = unit.replace(/\s/g, '');
  if (compact === 'lt' || compact === 'litro') return 'l';
  if (compact === 'und' || compact === 'unid' || compact === 'unidade') return 'un';
  if (compact === 'duzia') return 'dz';
  return compact;
}

function center(rect: Rect) {
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}
