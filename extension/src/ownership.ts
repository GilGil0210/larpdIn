import {profileKey} from './storage';
/** Resolve the current account in an isolated tab. Never infer ownership from an edit-looking URL. */
export async function resolveOwnProfile(timeoutMs=20000):Promise<string> {
 const tab=await chrome.tabs.create({url:'https://www.linkedin.com/in/me/',active:false});
 if(tab.id===undefined) throw new Error('Unable to open LinkedIn account check');
 const id=tab.id;
 try {
  return await new Promise<string>((resolve,reject)=>{
   let done=false;
   const finish=(err?:Error,value?:string)=>{if(done)return;done=true;clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);if(err)reject(err);else resolve(value!)};
   const check=(candidate:chrome.tabs.Tab)=>{
    if(candidate.id!==id || candidate.status!=='complete' || !candidate.url) return;
    try {
     const parsed=new URL(candidate.url);
     if(parsed.origin!=='https://www.linkedin.com') throw new Error('LinkedIn account check left LinkedIn');
     if(/^\/in\/me\/?$/i.test(parsed.pathname)) return;
     const match=parsed.pathname.match(/^\/in\/([^/]+)\/?$/i);
     if(!match) throw new Error(`LinkedIn account check reached ${parsed.pathname}; sign in before scanning your profile`);
     const canonical=`https://www.linkedin.com/in/${match[1]}/`;profileKey(canonical);finish(undefined,canonical);
    } catch(error){finish(error instanceof Error?error:new Error(String(error)))}
   };
   const listener=(tabId:number,_change:chrome.tabs.TabChangeInfo,updated:chrome.tabs.Tab)=>{if(tabId===id)check(updated)};
   const timer=setTimeout(()=>finish(new Error('Could not verify the signed-in LinkedIn profile')),timeoutMs);
   chrome.tabs.onUpdated.addListener(listener);
   chrome.tabs.get(id).then(check).catch(error=>finish(new Error(String(error))));
  });
 } finally {await chrome.tabs.remove(id).catch(()=>{});}
}
export function assertOwner(candidate:string,owner:string):void {
 if(profileKey(candidate)!==profileKey(owner)) throw new Error('This profile does not match the signed-in LinkedIn account');
}
