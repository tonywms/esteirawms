"use client";
// V34 · Avanço (%) automático (pelo cronograma ou pela fase da esteira) e fluxo do projeto (completo ou simplificado).
import { Gauge, GitBranch } from "lucide-react";
import type { Project } from "@/lib/types";
import { progressInfo } from "@/lib/progress";
import Select from "./Select";

type Props = { form: Record<string, unknown>; setForm: (f: (x: Record<string, unknown>) => Record<string, unknown>) => void };

export default function ProgressFields({ form, setForm }: Props) {
  const manual = form.progressMode === "manual";
  const info = progressInfo({ ...(form as unknown as Project), progressMode: "auto" });
  const set = (v: Record<string, unknown>) => setForm(f => ({ ...f, ...v }));
  return <>
    <label className="form-field v34-prog">
      <span className="p6-label"><Gauge size={15} />Avanço (%)</span>
      {manual
        ? <input type="number" min={0} max={100} value={String(form.progress ?? 0)} onChange={e => set({ progress: Number(e.target.value) })} />
        : <div className="v34-auto" title={info.detail}><b>{info.pct}%</b><i><span style={{ width: `${info.pct}%` }} /></i><small>Automático · {info.detail}</small></div>}
      <span className="v34-ck"><input type="checkbox" checked={manual} onChange={e => set(e.target.checked ? { progressMode: "manual", progress: info.pct } : { progressMode: "auto", progress: info.pct })} /> Definir manualmente (não segue o cronograma)</span>
    </label>
    <label className="form-field v34-flow">
      <span className="p6-label"><GitBranch size={15} />Fluxo do projeto</span>
      <Select value={form.flow === "simples" ? "simples" : "completo"} onChange={e => set({ flow: e.target.value === "simples" ? "simples" : "completo" })}>
        <option value="completo">Completo · todas as fases</option>
        <option value="simples">Simplificado · customização</option>
      </Select>
      <small className="v34-hint">{form.flow === "simples" ? "Não cobra os PDFs de kickoff, integração e implantação; o avanço conta só homologação e go-live." : "Segue todas as fases da esteira, com o PDF de cada uma."}</small>
    </label>
  </>;
}
