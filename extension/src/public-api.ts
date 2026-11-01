/** UI-to-engine contract. Restoration records and credentials never cross this boundary. */
import type {z} from 'zod';
import type {candidate,Profile} from './contract';
import type {SavedPersona} from './storage';
export type Candidate=z.infer<typeof candidate>;
export type Blocker={code:string;message:string;section:'profile'|'intro'|'about'|'education'|'storage'|'operation';action:'connect'|'scan'|'retry'|'recover'|'review'|'none'};
export type SectionProgress='pending'|'saving'|'verified'|'failed'|'uncertain';
export type AppState={
 settings:{backendUrl:string};
 connectedProfile:string|null;
 scan:{content:Profile;capturedAt:string;freshness:'fresh'|'stale'}|null;
 snapshotReadiness:'unchecked'|'ready'|'blocked';
 blockers:Blocker[];
 candidates:Candidate[];
 personas:SavedPersona[];
 activePersonaId:string|null;
 restoration:{original:boolean;undo:boolean};
 operation:null|{status:string;message:string;sections:Record<'intro'|'about'|'education',SectionProgress>;recoveryAvailable:boolean};
};
export interface LarpdinClient {
 getState():Promise<AppState>;
 subscribe(listener:(state:AppState)=>void):()=>void;
 saveSettings(settings:{backendUrl:string}):Promise<void>;
 checkConnection():Promise<void>;
 connectProfile():Promise<void>;
 scanProfile():Promise<void>;
 generate(brief:string):Promise<void>;
 savePersona(value:Candidate):Promise<void>;
 editPersona(id:string,value:Candidate):Promise<void>;
 deletePersona(id:string):Promise<void>;
 preview(id:string):Promise<{before:Profile;after:Profile}>;
 apply(id:string):Promise<void>;
 restoreOriginal():Promise<void>;
 undo():Promise<void>;
 recover():Promise<void>;
 exportDiagnostics():Promise<string>;
}
