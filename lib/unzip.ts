// V30 · Leitor mínimo de ZIP (para abrir o .docx modelo) — sem dependências.
import { inflateRawSync } from "node:zlib";

export function unzip(buf: Buffer): { name: string; data: Buffer }[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Arquivo ZIP/DOCX inválido.");
  const count = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16);
  const out: { name: string; data: Buffer }[] = [];
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Diretório do ZIP inválido.");
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), loff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString("utf8");
    const lnl = buf.readUInt16LE(loff + 26), lxl = buf.readUInt16LE(loff + 28), start = loff + 30 + lnl + lxl;
    const raw = buf.subarray(start, start + csize);
    out.push({ name, data: method === 0 ? Buffer.from(raw) : inflateRawSync(raw) });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
