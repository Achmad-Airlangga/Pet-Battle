/**
 * Minimal, dependency-free .xlsx reader: unzips the package and returns the
 * first worksheet as a sparse grid of strings. Handles shared and inline strings.
 */
import { inflateRawSync } from 'node:zlib';

function unzip(buf: Buffer): Map<string, Buffer> {
  // End Of Central Directory record (search backwards, allowing a trailing comment).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file (no end of central directory)');

  const entries = new Map<string, Buffer>();
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt zip central directory');
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const raw = buf.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) entries.set(name, Buffer.from(raw));
    else if (method === 8) entries.set(name, inflateRawSync(raw));
    else throw new Error(`Unsupported zip compression method ${method} for ${name}`);
  }
  return entries;
}

const decodeXml = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()]!;
  });

/** Concatenates every <t> run (handles rich text). */
const textOf = (xml: string): string =>
  decodeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

const columnIndex = (ref: string): number => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export interface Sheet {
  name: string;
  /** rows[rowNumber - 1][columnIndex] */
  rows: string[][];
}

export function readFirstSheet(file: Buffer): Sheet {
  const zip = unzip(file);
  const read = (path: string): string => {
    const entry = zip.get(path);
    if (!entry) throw new Error(`Missing ${path} in workbook`);
    return entry.toString('utf8');
  };

  const workbook = read('xl/workbook.xml');
  const sheetTag = workbook.match(/<sheet\s[^>]*>/)?.[0];
  if (!sheetTag) throw new Error('Workbook has no sheets');
  const sheetName = decodeXml(sheetTag.match(/name="([^"]*)"/)![1]);
  const relId = sheetTag.match(/r:id="([^"]*)"/)![1];
  const rel = [...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\s[^>]*>/g)]
    .map((m) => m[0])
    .find((tag) => tag.includes(`Id="${relId}"`));
  const target = rel?.match(/Target="([^"]*)"/)?.[1];
  if (!target) throw new Error(`Cannot resolve sheet relationship ${relId}`);
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;

  const shared = zip.has('xl/sharedStrings.xml')
    ? [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
    : [];

  const rows: string[][] = [];
  for (const row of read(sheetPath).matchAll(/<row\s[^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cell of row[2].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const body = cell[2] ?? '';
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      if (!ref) continue;
      const type = attrs.match(/t="([^"]*)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(body);
      else if (v !== undefined) value = decodeXml(v);
      cells[columnIndex(ref)] = value;
    }
    rows[Number(row[1]) - 1] = cells;
  }
  return { name: sheetName, rows };
}
