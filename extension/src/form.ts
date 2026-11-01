/** DOM helpers for LinkedIn's English desktop forms. Fail closed on missing or ambiguous controls. */
type TextControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;
export function fieldValue(el:TextControl):string {return 'value' in el?String(el.value):el.textContent||''}
function labelOf(el:TextControl):string {
 const explicit=el.getAttribute('aria-label')?.trim();
 if(explicit) return explicit;
 const labelled=el.getAttribute('aria-labelledby');
 if(labelled){const text=labelled.split(/\s+/).map(id=>el.ownerDocument.getElementById(id)?.textContent?.trim() ?? '').join(' ').trim();if(text)return text;}
 return Array.from(('labels' in el?el.labels:null) ?? []).map(label=>{const copy=label.cloneNode(true) as HTMLElement;copy.querySelectorAll('input,textarea,select,button').forEach(child=>child.remove());return copy.textContent?.trim() ?? '';}).join(' ').trim();
}
const normalize=(s:string)=>s.replace(/\s+/g,' ').replace(/,\s*maximum\s+[\d,]+\s+characters?\s*$/i,'').replace(/\s*\*\s*$/,'').trim().toLowerCase();
export function findField(root:ParentNode,label:string):TextControl {
 const matches=Array.from(root.querySelectorAll<TextControl>('input,textarea,select,[contenteditable="true"]')).filter(el=>(!('disabled' in el)||!el.disabled) && (!('type' in el)||el.type!=='hidden') && normalize(labelOf(el))===normalize(label));
 if(matches.length!==1) throw new Error(`Expected one ${label} field, found ${matches.length}`);
 return matches[0];
}
export function findButton(root:ParentNode,label:string):HTMLButtonElement {
 const matches=Array.from(root.querySelectorAll<HTMLButtonElement>('button')).filter(el=>!el.disabled && normalize(el.getAttribute('aria-label') || el.textContent || '')===normalize(label));
 if(matches.length!==1) throw new Error(`Expected one ${label} button, found ${matches.length}`);
 return matches[0];
}
export function setText(field:TextControl,value:string):void {
 if(field instanceof field.ownerDocument.defaultView!.HTMLSelectElement) throw new Error('Select controls require an explicit option');
 const view=field.ownerDocument.defaultView!;
 if(!(field instanceof view.HTMLInputElement)&&!(field instanceof view.HTMLTextAreaElement)){if(field.getAttribute('contenteditable')!=='true')throw new Error('Expected an editable text field');field.focus();field.textContent=value;field.dispatchEvent(new view.InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));field.dispatchEvent(new view.Event('change',{bubbles:true}));if(fieldValue(field)!==value)throw new Error('Field did not accept value');return}
 const proto=field instanceof view.HTMLTextAreaElement ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
 const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
 if(!setter) throw new Error('Native value setter unavailable');
 setter.call(field,value);
 field.dispatchEvent(new view.Event('input',{bubbles:true}));
 field.dispatchEvent(new view.Event('change',{bubbles:true}));
 if(field.value!==value) throw new Error('Field did not accept value');
}
export function selectOption(field:TextControl,label:string):void {
 const view=field.ownerDocument.defaultView!;
 if(!(field instanceof view.HTMLSelectElement)) throw new Error('Expected a select control');
 const options=Array.from(field.options).filter(option=>normalize(option.textContent || '')===normalize(label) && !option.disabled);
 if(options.length!==1) throw new Error(`Expected one option ${label}, found ${options.length}`);
 field.value=options[0].value; field.dispatchEvent(new view.Event('change',{bubbles:true}));
 if(field.value!==options[0].value) throw new Error('Option was not selected');
}

/** Select a unique, exact suggestion from the list owned by this field. */
export async function selectAutocomplete(field:TextControl,value:string,timeoutMs=5000):Promise<void> {
 const view=field.ownerDocument.defaultView!;
 if(!(field instanceof view.HTMLInputElement)) throw new Error('Autocomplete must be an input');
 const listId=field.getAttribute('aria-controls');
 if(!listId) throw new Error('Autocomplete does not identify its suggestion list');
 setText(field,value);
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  const list=field.ownerDocument.getElementById(listId);
  const matches=list ? Array.from(list.querySelectorAll<HTMLElement>('[role="option"]')).filter(el=>normalize(el.textContent || '')===normalize(value) && el.getAttribute('aria-disabled')!=='true' && !el.hidden && !el.closest('[aria-hidden="true"], [hidden]') && el.getClientRects().length>0 && view.getComputedStyle(el).visibility!=='hidden') : [];
  if(matches.length>1) throw new Error(`Ambiguous suggestion: ${value}`);
  if(matches.length===1){
   matches[0].click();
   // A typed string alone is not evidence that LinkedIn accepted a suggestion.
   await new Promise(resolve=>view.setTimeout(resolve,0));
   const selectedList=field.ownerDocument.getElementById(listId);
   const closed=field.getAttribute('aria-expanded')==='false' || !selectedList || selectedList.hidden || selectedList.getAttribute('aria-hidden')==='true';
   if(normalize(field.value)!==normalize(value) || !closed) throw new Error('Autocomplete selection was not confirmed');
   return;
  }
  await new Promise(resolve=>view.setTimeout(resolve,50));
 }
 throw new Error(`No exact suggestion for ${value}`);
}
