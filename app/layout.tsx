import type {Metadata} from "next";
import "./globals.css";
import "./enterprise.css";
import "./esteira-premium.css";
import "./esteira-v4.css";
import "./esteira-v5.css";
export const metadata:Metadata={title:"WMS Expert | Esteira de Entregas",description:"Esteira de desenvolvimento, integração, implantação, projetos, tarefas e agendas da WMS Expert"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
