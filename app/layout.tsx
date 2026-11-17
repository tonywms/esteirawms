import type {Metadata} from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import "./enterprise.css";
import "./esteira-premium.css";
import "./esteira-v4.css";
import "./esteira-v5.css";
import "./premium-v6.css";
import "./esteira-v7.css";
export const metadata:Metadata={title:"WMS Expert | Esteira de Entregas",description:"Esteira de desenvolvimento, integração, implantação, projetos, tarefas e agendas da WMS Expert"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
