import type {AppState,Candidate,LarpdinClient} from './public-api';
import {candidate} from './contract';
const blank:AppState={settings:{backendUrl:'https://larpdin-backend.onrender.com'},connectedProfile:null,scan:null,snapshotReadiness:'unchecked',blockers:[{code:'profile_disconnected',message:'Connect your signed-in LinkedIn profile.',section:'profile',action:'connect'}],candidates:[],personas:[],activePersonaId:null,restoration:{original:false,undo:false},operation:null};
/** Deterministic in-memory implementation for UI development; never contacts LinkedIn. */
export function createMockClient(initial:Partial<AppState>={}):LarpdinClient {
 let state:AppState=structuredClone({...blank,...initial});const listeners=new Set<(state:AppState)=>void>();let undo:string|null=null;
 const read=()=>structuredClone(state);const notify=()=>listeners.forEach(fn=>fn(read()));
 const find=(id:string)=>{const value=state.personas.find(x=>x.id===id);if(!value)throw Error('Persona not found');return value};
 const complete=(id:string|null)=>{undo=state.activePersonaId;state.activePersonaId=id;state.restoration={original:true,undo:true};state.operation={status:'complete',message:'Switch verified',sections:{intro:'verified',about:'verified',education:'verified'},recoveryAvailable:false};notify()};
 return {
  async getState(){return read()},subscribe(fn){listeners.add(fn);fn(read());return()=>listeners.delete(fn)},
  async saveSettings(value){state.settings={backendUrl:value.backendUrl};notify()},
  async checkConnection(){},
  async connectProfile(){state.connectedProfile='https://www.linkedin.com/in/example/';state.blockers=[];notify()},
  async scanProfile(){if(!state.connectedProfile)throw Error('Connect your profile first');state.scan={content:{headline:'Example headline',location:'Toronto',industry:'Technology',about:'Example About',education:[]},capturedAt:new Date().toISOString(),freshness:'fresh'};state.snapshotReadiness='ready';state.blockers=[];notify()},
  async generate(brief){if(!state.scan)throw Error('Scan your profile first');state.candidates=[1,2,3].map(i=>({name:`Example ${i}`,description:brief,content:structuredClone(state.scan!.content)}));notify()},
  async savePersona(value:Candidate){state.personas.push({...candidate.parse(value),id:crypto.randomUUID(),createdAt:new Date().toISOString()});notify()},
  async editPersona(id,value){const item=find(id);Object.assign(item,candidate.parse(value));notify()},
  async deletePersona(id){find(id);state.personas=state.personas.filter(x=>x.id!==id);notify()},
  async preview(id){if(!state.scan)throw Error('Scan your profile first');return {before:structuredClone(state.scan.content),after:structuredClone(find(id).content)}},
  async apply(id){find(id);if(state.blockers.length)throw Error(state.blockers[0].message);complete(id)},
  async restoreOriginal(){if(!state.restoration.original)throw Error('Original snapshot is unavailable');complete(null)},
  async undo(){if(!state.restoration.undo)throw Error('Undo is unavailable');complete(undo)},
  async recover(){if(!state.operation?.recoveryAvailable)throw Error('Recovery is unavailable');complete(null)},
  async exportDiagnostics(){return JSON.stringify({snapshotReadiness:state.snapshotReadiness,blockers:state.blockers.map(({code,section,action})=>({code,section,action})),operation:state.operation?{status:state.operation.status,sections:state.operation.sections}:null},null,2)}
 };
}
