/** Runs in the page, so this function must not reference module-scoped values. */
export function inspectLinkedInForm() {
 const url=new URL(location.href);
 if(url.origin!=='https://www.linkedin.com' || !/^\/in\/[^/]+\//.test(url.pathname)) throw new Error('Open your LinkedIn profile editor first.');
 const root=document.querySelector('dialog[open], [role="dialog"]') ?? document.querySelector('main') ?? document.body;
 const controls=Array.from(root.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|HTMLElement>('input,textarea,select,[contenteditable]:not([contenteditable="false"])'));
 const fields=controls.filter(el=>!('type' in el) || (el.type!=='hidden' && el.type!=='password')).map(el=>{
  const labels=Array.from(('labels' in el?el.labels:null)??[]).map(label=>{const copy=label.cloneNode(true) as HTMLElement;copy.querySelectorAll('input,textarea,select,button').forEach(child=>child.remove());return copy.textContent?.trim() ?? '';}).filter(Boolean);
  const referenced=(el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)?.textContent?.trim() || '').join(' ').trim();
  const paragraphs=Array.from(el.children);const rich=!('value' in el)&&paragraphs.length>0&&paragraphs.every(child=>child.tagName==='P');
  return {label:el.getAttribute('aria-label') || referenced || labels.join(' ') || '',value:'value' in el?String(el.value):rich?paragraphs.map(p=>p.textContent||'').join('\n'):el.textContent||'',tag:el.tagName.toLowerCase(),type:'type' in el?String(el.type):'contenteditable'};
 });
 return {url:url.origin+url.pathname,title:document.title,fields};
}
export type Inspection=ReturnType<typeof inspectLinkedInForm>;
export async function inspectActiveTab():Promise<Inspection>{
 const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});
 if(!tab?.id || !tab.url || !/^https:\/\/www\.linkedin\.com\/in\/[^/]+\//.test(tab.url)) throw new Error('Open a LinkedIn profile editor in the active tab.');
 const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:inspectLinkedInForm});
 if(!results[0]?.result) throw new Error('Could not inspect the page.');
 return results[0].result;
}
