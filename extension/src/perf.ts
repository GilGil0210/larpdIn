/** Lightweight phase timings for the most recent switch, stored under `perf-last` for diagnosis. */
let marks:{label:string;ms:number}[]=[];
let origin=0;
export function perfReset():void {marks=[];origin=Date.now();}
export function perfMark(label:string):void {
 if(!origin)origin=Date.now();
 marks.push({label,ms:Date.now()-origin});
 if(typeof chrome!=='undefined'&&chrome.storage?.local)void chrome.storage.local.set({'perf-last':{startedAt:new Date(origin).toISOString(),marks}}).catch(()=>{});
}
