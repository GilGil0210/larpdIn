/** Mark jobs left by a previous worker as interrupted; submissions are never replayed. */
export async function reconcileWorkerJobs():Promise<void>{
 const all=await chrome.storage.local.get(null);
 for(const [key,value] of Object.entries(all)){
  if(key.startsWith('switch-job:') && value?.status==='running')
   await chrome.storage.local.set({[key]:{...value,status:'interrupted',message:'The background worker stopped. Recover from a fresh scan; a submission will not be replayed.'}});
 }
}
