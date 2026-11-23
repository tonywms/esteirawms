"use client";
// V25 · Junta PDFs e fotos (celular, scanner, print) num único PDF, no próprio navegador.
// Um PDF sozinho sobe como está; fotos viram páginas A4 com a imagem inteira.
import { shrinkImage, fileKind } from "./task-uploads";

export const MAX_PDF = 25 * 1048576;
export const okFile = (f: File) => !!fileKind(f);

export async function filesToPdf(files: File[], title = "documento"): Promise<{ blob: Blob; name: string; pages: number }> {
  if (!files.length) throw new Error("Escolha ao menos um arquivo.");
  const bad = files.find(f => !okFile(f)); if (bad) throw new Error(`${bad.name}: envie PDF ou foto (JPG, PNG, HEIC convertida).`);
  const safe = (title.trim() || "documento").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "documento";
  if (files.length === 1 && fileKind(files[0]) === "pdf") {
    if (files[0].size > MAX_PDF) throw new Error("O PDF deve ter no máximo 25 MB.");
    return { blob: files[0], name: files[0].name, pages: 0 };
  }
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (const f of files) {
    if (fileKind(f) === "pdf") {
      const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true }).catch(() => { throw new Error(`${f.name}: não foi possível ler este PDF (protegido ou corrompido).`); });
      (await out.copyPages(src, src.getPageIndices())).forEach(pg => out.addPage(pg));
    } else {
      const jpg = await shrinkImage(f).catch(() => { throw new Error(`${f.name}: não foi possível ler esta foto. Tire um print ou salve como JPG.`); });
      const img = await out.embedJpg(await jpg.arrayBuffer());
      const W = 595.28, H = 841.89, m = 24;
      const landscape = img.width > img.height;
      const pw = landscape ? H : W, ph = landscape ? W : H;
      const k = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height);
      const page = out.addPage([pw, ph]);
      page.drawImage(img, { x: (pw - img.width * k) / 2, y: (ph - img.height * k) / 2, width: img.width * k, height: img.height * k });
    }
  }
  out.setTitle(title); out.setProducer("WMS Expert Esteira");
  const bytes = await out.save();
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  if (blob.size > MAX_PDF) throw new Error("O documento ficou acima de 25 MB. Envie menos fotos ou fotos menores.");
  return { blob, name: `${safe}.pdf`, pages: out.getPageCount() };
}

/** Sobe o PDF para o armazenamento privado (fase do projeto ou "extra") e devolve o caminho. */
export async function uploadProjectPdf(projectId: string, phase: string, blob: Blob, onPct?: (n: number) => void): Promise<string> {
  const r = await fetch("/api/docs/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, phase }) });
  const t = await r.json().catch(() => ({})); if (!r.ok) throw new Error(t.error || "Falha ao preparar o envio.");
  await new Promise<void>((res, rej) => {
    const x = new XMLHttpRequest(); x.open("POST", t.uploadUrl);
    x.setRequestHeader("apikey", t.apikey); x.setRequestHeader("Authorization", `Bearer ${t.apikey}`); x.setRequestHeader("Content-Type", "application/pdf"); x.setRequestHeader("x-upsert", "false");
    x.upload.onprogress = e => { if (e.lengthComputable) onPct?.(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => (x.status < 300 ? res() : rej(new Error(`Falha no envio do PDF (${x.status}). ${x.responseText.slice(0, 120)}`)));
    x.onerror = () => rej(new Error("Falha de conexão ao enviar o PDF."));
    x.send(blob);
  });
  return t.path as string;
}
