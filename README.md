# WMS Expert — Esteira de Entregas

Sistema web de acompanhamento de clientes, projetos, atividades e prazos, desenvolvimento e integrações, implantação, agenda de consultores e relatórios executivos.

## Tecnologias
- Next.js 16 (App Router), React 19, TypeScript
- Lucide SVG, Recharts
- Persistência **local** em JSON (`data/state.json`). **Não há autenticação cloud** nesta versão.

## Instalação local

```bash
npm install
npm run init-data
npm run typecheck
npm run verify
npm run dev
```

A aplicação local utiliza `http://localhost:3001`.

`npm run init-data` cria um estado inicial vazio **somente se** `data/state.json` não existir. Para recuperar a carteira já existente, copie seu `data/state.json` privado e salvo em backup para a pasta `data/`, sem publicá-lo. A V5 inclui cadastro local de usuários; **isso não cria contas autenticadas**.

## Proteção dos dados

Esta versão não deve ser publicada diretamente na internet: as APIs locais de cadastros ainda não possuem autenticação/autorização. Integrar o Supabase Auth, políticas RLS e armazenamento cloud antes de expor endpoints a usuários externos.

O repositório é público e deliberadamente **não inclui** dados reais, planilhas da carteira, backups nem credenciais.

## Atualizações no Windows

Use o instalador de atualização V5.2 entregue separadamente para aplicar o patch sobre a V4 local com backup, verificação e rollback. O código-fonte neste repositório corresponde à interface V5 corrigida, sem dados sensíveis.
