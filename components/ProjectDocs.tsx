"use client";
// V25 · Documentos do projeto na ficha do cliente/projeto: anexar já assinado (PDF/foto) ou enviar para assinar.
import { useState } from "react";
import type { Project, State } from "@/lib/types";
import ExtraDocs from "./ExtraDocs";
import SignDialog, { type SignTarget } from "./SignDialog";

export default function ProjectDocs({ project, data, onRefresh, notify, canWrite = true }: { project: Project; data: State; onRefresh: () => Promise<void> | void; notify: (m: string) => void; canWrite?: boolean }) {
  const [signTarget, setSignTarget] = useState<SignTarget | null>(null);
  const flash = (m: string, err = false) => notify(err && !/^(Falha|Erro|Atenção)/i.test(m) ? `Falha: ${m}` : m);
  return <div className="panel v25-docs-panel">
    <ExtraDocs project={project} tasks={data.tasks} client={data.clients.find(c => c.id === project.clientId)} onRefresh={onRefresh} flash={flash} onSign={setSignTarget} canWrite={canWrite} />
    {signTarget && <SignDialog target={signTarget} onClose={() => setSignTarget(null)} onDone={async m => { await onRefresh(); notify(m); }} />}
  </div>;
}
