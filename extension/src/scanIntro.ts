import {inspectLinkedInForm} from './inspection';
import {importIntro} from './partialScan';
import {resolveOwnProfile,assertOwner} from './ownership';
import type {Profile} from './contract';

/** Read the signed-in user's intro in a temporary tab. This is not a complete profile scan. */
export async function scanIntro(current:Profile,timeoutMs=15000):Promise<{profileUrl:string;content:Profile}> {
 const owner=await resolveOwnProfile();
 const editor=new URL('edit/intro/',owner).href;
 const tab=await chrome.tabs.create({url:editor,active:false});
 if(tab.id===undefined) throw new Error('Could not open the LinkedIn intro editor');
 const id=tab.id, deadline=Date.now()+timeoutMs;
 try {
  let lastError:unknown;
  while(Date.now()<deadline){
   try {
    const state=await chrome.tabs.get(id);
    if(state.status==='complete') {
     const results=await chrome.scripting.executeScript({target:{tabId:id},func:inspectLinkedInForm});
     const inspection=results[0]?.result;
     if(!inspection) throw new Error('LinkedIn editor returned no form');
     const result=importIntro(inspection,current);assertOwner(result.profileUrl,owner);return result;
    }
   } catch(error){lastError=error;}
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error(`Could not read the intro editor${lastError instanceof Error?`: ${lastError.message}`:''}`);
 } finally {await chrome.tabs.remove(id).catch(()=>{});}
}
