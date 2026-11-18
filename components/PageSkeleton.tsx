// V16 · Carregamento com o formato da página (no lugar do "Carregando painel...").
export default function PageSkeleton() {
  return <div className="v16-skel" aria-busy="true" aria-label="Carregando">
    <div className="v16-sk v16-sk-head" />
    <div className="v16-sk-row">{[0, 1, 2, 3].map(i => <div key={i} className="v16-sk v16-sk-tile" />)}</div>
    <div className="v16-sk v16-sk-panel">
      <div className="v16-sk-bar" />
      {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="v16-sk-line"><i /><i /><i /><i /></div>)}
    </div>
  </div>;
}
