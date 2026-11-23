// V29 · Gerador mínimo de .xlsx (Office Open XML) sem dependências: zip + XML com estilos.
import { deflateRawSync } from "node:zlib";

/* ---------- ZIP ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b: Buffer) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function zip(files: { name: string; data: string | Buffer }[]) {
  const chunks: Buffer[] = [], central: Buffer[] = []; let off = 0;
  for (const f of files) {
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, "utf8"), comp = deflateRawSync(raw), name = Buffer.from(f.name, "utf8"), crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    chunks.push(lh, name, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, name); off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...chunks, cd, end]);
}

/* ---------- XLSX ---------- */
export type Style = { bold?: boolean; size?: number; color?: string; fill?: string; align?: "left" | "center" | "right"; valign?: "top" | "center"; wrap?: boolean; rotate?: number; border?: boolean; date?: boolean; italic?: boolean };
export type Cell = { v: string | number | null; s?: Style; date?: boolean };
export type Sheet = { name: string; cols: number[]; rows: (Cell | null)[][]; heights?: Record<number, number>; merges?: string[]; freezeRow?: number; landscape?: boolean };
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
export const colName = (i: number) => { let s = "", n = i + 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
/** "2026-11-23" → número de série do Excel */
export const excelDate = (iso: string) => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5);

export function buildXlsx(sheets: Sheet[]) {
  const fonts: string[] = ['<font><sz val="10"/><name val="Calibri"/></font>'], fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>', '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE3E8ED"/></bottom><diagonal/></border>'];
  const xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], keyIdx = new Map<string, number>();
  const fontId = (s: Style) => { const x = `<font>${s.bold ? "<b/>" : ""}${s.italic ? "<i/>" : ""}<sz val="${s.size || 10}"/>${s.color ? `<color rgb="FF${s.color.replace("#", "")}"/>` : ""}<name val="Calibri"/></font>`; let i = fonts.indexOf(x); if (i < 0) { fonts.push(x); i = fonts.length - 1; } return i; };
  const fillId = (s: Style) => { if (!s.fill) return 0; const x = `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill.replace("#", "")}"/><bgColor indexed="64"/></patternFill></fill>`; let i = fills.indexOf(x); if (i < 0) { fills.push(x); i = fills.length - 1; } return i; };
  const styleId = (s?: Style, date?: boolean) => {
    if (!s && !date) return 0; const st = s || {}; const key = JSON.stringify([st, !!date]); const hit = keyIdx.get(key); if (hit !== undefined) return hit;
    const al = st.align || st.valign || st.wrap || st.rotate ? `<alignment${st.align ? ` horizontal="${st.align}"` : ""} vertical="${st.valign || "center"}"${st.wrap ? ' wrapText="1"' : ""}${st.rotate ? ` textRotation="${st.rotate}"` : ""}/>` : '<alignment vertical="center"/>';
    xfs.push(`<xf numFmtId="${date ? 164 : 0}" fontId="${fontId(st)}" fillId="${fillId(st)}" borderId="${st.border ? 1 : 0}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"${date ? ' applyNumberFormat="1"' : ""}>${al}</xf>`);
    keyIdx.set(key, xfs.length - 1); return xfs.length - 1;
  };
  const sheetXml = sheets.map(sh => {
    const rowsXml = sh.rows.map((row, ri) => {
      const cells = row.map((c, ci) => {
        if (!c) return ""; const ref = `${colName(ci)}${ri + 1}`, s = styleId(c.s, c.date);
        if (c.v === null || c.v === "") return `<c r="${ref}" s="${s}"/>`;
        if (typeof c.v === "number") return `<c r="${ref}" s="${s}"><v>${c.v}</v></c>`;
        return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(String(c.v))}</t></is></c>`;
      }).join("");
      const ht = sh.heights?.[ri + 1]; return `<row r="${ri + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ""}>${cells}</row>`;
    }).join("");
    const pane = sh.freezeRow ? `<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${sh.freezeRow}" topLeftCell="A${sh.freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>${pane}<sheetFormatPr defaultRowHeight="15"/><cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${rowsXml}</sheetData>${sh.merges?.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : ""}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${sh.landscape ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  });
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="${borders.length}">${borders.join("")}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: styles },
    ...sheetXml.map((x, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: x })),
  ];
  return zip(files);
}
