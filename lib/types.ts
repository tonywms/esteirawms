export type Source = {sheet: string; row: number};
export type Client = {id:string;name:string;system:string;notes:string;createdAt:string;updatedAt:string;source?:Source};
export type Readiness = {connectivity:string;collectors:string;testBase:string;keyUser:string};
export type TimelineEvent = {id:string;at:string;text:string;kind?:string;author?:string};
export type PhaseDoc = {path:string;name:string;size?:number;uploadedAt:string;uploadedBy?:string}; /* WMS_ESTEIRA_V8 */
export type PhaseInfo = {owner?:string;start?:string|null;due?:string|null;done?:string|null;doc?:PhaseDoc|null;docSentAt?:string|null;docSentBy?:string;docWaived?:DocWaiver|null};
export type DocWaiver = {by:string;email:string;at:string;reason:string}; /* WMS_ESTEIRA_V8_1 */
export type Project = {id:string;clientId:string;name:string;system:string;wave:string;stage:string;progress:number;status:string;team:string;integrationOwner:string;implementationOwner:string;blocker:string;readiness:Readiness;lastMovement:string|null;initialMilestone:string|null;integrationDelivery:string|null;homologationDate:string|null;goLiveDate:string|null;implementationStart:string|null;notes:string;createdAt:string;updatedAt:string;source?:Source;
 /* V7 · esteira por fases (opcionais: projetos antigos sao derivados automaticamente) */
 phase?:string;phases?:Record<string,PhaseInfo>;ballWith?:string;nextAction?:string;nextActionOwner?:string;nextActionDue?:string|null;timeline?:TimelineEvent[];archivedAt?:string|null};
export type Task = {id:string;projectId:string;clientId:string;title:string;owner:string;startDate:string|null;dueDate:string|null;status:string;blocker:string;notes:string;slaOriginal?:string;createdAt:string;updatedAt:string;source?:Source;attachments?:TaskAttachment[]};
export type TaskAttachment = {id:string;path:string;name:string;size?:number;type:"image"|"pdf";uploadedAt:string;uploadedBy?:string}; /* WMS_ESTEIRA_V12 */
export type Appointment = {id:string;projectId:string;clientId:string;consultant:string;date:string|null;shift:string;modality:string;title:string;status:string;notes:string;message:string;sourceWeek?:string;createdAt:string;updatedAt:string;source?:Source};
export type WorkspaceUser = {id:string;name:string;email:string;role:string;active:boolean;notes:string;createdAt:string;updatedAt:string;hasPassword?:boolean;lastLoginAt?:string|null;password?:string};
export type Staff = {id:string;name:string;role:string;capacity:number;active:boolean;createdAt:string;updatedAt:string;email?:string;sector?:string;escalation?:boolean}; /* WMS_ESTEIRA_V9 */
export type Audit = {id:string;at:string;entity:string;operation:string;recordId:string;label:string};
export type EntityName="clients"|"projects"|"tasks"|"appointments"|"staff"|"users";
export type State={version:number;importedAt:string;sourceFile:string;clients:Client[];projects:Project[];tasks:Task[];appointments:Appointment[];staff:Staff[];users:WorkspaceUser[];audit:Audit[]};
