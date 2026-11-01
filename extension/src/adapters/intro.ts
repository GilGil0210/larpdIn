import {findField,findButton,setText,fieldValue} from '../form';

/** Validate all controls observed in the intro form before changing anything. */
export function readIntro(root:ParentNode) {
 const headline=findField(root,'Headline');
 const country=findField(root,'Country/Region');
 // Postal-code countries: LinkedIn may not render the City list in a background tab until the form is edited.
 let city:ReturnType<typeof findField>|null=null,postal:ReturnType<typeof findField>|null=null;
 // Prefer the postal code when present so repeated reads agree whether or not the City list has rendered yet.
 try{postal=findField(root,'Postal code')}catch{postal=null}
 if(!postal)city=findField(root,'City');
 const industry=findField(root,'Industry');
 // Ensure the identity fields and save control exist so this is the expected form.
 findField(root,'First name'); findField(root,'Last name'); findButton(root,'Save');
 const cityText=city?(city.tagName==='SELECT'?((city as HTMLSelectElement).selectedOptions[0]?.textContent||'').trim():fieldValue(city)):`postal:${fieldValue(postal!).trim()}`;
 return {headline:fieldValue(headline),country:fieldValue(country),city:cityText,industry:fieldValue(industry)};
}
/** Changes the headline only. The caller owns submission, verification, and recovery. */
export function prepareHeadline(root:ParentNode,value:string) {
 const before=readIntro(root);
 setText(findField(root,'Headline'),value);
 const after=readIntro(root);
 if(after.headline!==value || before.country!==after.country || before.city!==after.city || before.industry!==after.industry) throw new Error('Intro fields changed unexpectedly');
 return before;
}

import {selectAutocomplete} from '../form';
export type IntroValues={firstName:string;lastName:string;additionalName:string;pronouns:string;education:string;headline:string;country:string;city:string;industry:string};
export function readCompleteIntro(root:ParentNode):IntroValues {
 const intro=readIntro(root);
 return {...intro,firstName:fieldValue(findField(root,'First name')),lastName:fieldValue(findField(root,'Last name')),additionalName:fieldValue(findField(root,'Additional name')),pronouns:fieldValue(findField(root,'Pronouns')),education:fieldValue(findField(root,'Education'))};
}
/** Prepares, but does not save, a validated intro form. Location and industry must match exact suggestions. */
export async function prepareIntro(root:ParentNode,before:IntroValues,target:{headline:string;location:string;industry:string;country?:string}):Promise<void> {
 const current=readCompleteIntro(root);
 if((Object.keys(current) as (keyof IntroValues)[]).some(key=>current[key]!==before[key]))throw new Error('Intro changed since the snapshot');
 const headline=findField(root,'Headline'),country=findField(root,'Country/Region'),industry=findField(root,'Industry');
 if(target.country&&target.country!==before.country)await selectAutocomplete(country,target.country);
 // Resolve both suggestions before touching unrelated fields. A failed selection leaves only unsaved form edits.
 if(!sameLocation(target.location,before.city)){if(target.location)await setLocation(root,target.location);else setText(findField(root,'City'),'')}
 if(target.industry!==before.industry){if(target.industry)await selectAutocomplete(industry,target.industry);else setText(industry,'')}
 setText(headline,target.headline);
 const after=readCompleteIntro(root);
 for(const key of ['firstName','lastName','additionalName','pronouns','education'] as const) if(after[key]!==before[key])throw new Error(`Intro ${key} changed unexpectedly`);
 if((target.country&&after.country!==target.country)||after.headline!==target.headline || !sameLocation(after.city,target.location) || after.industry!==target.industry)throw new Error('Intro values do not match target');
}

/** Postal codes for countries where LinkedIn asks for a postal code before offering a City list. Extend as needed. */
const POSTAL_CODES:Record<string,string>={
 'new york, new york, united states':'10001','new york, ny':'10001','san francisco, california, united states':'94103','los angeles, california, united states':'90012',
 'seattle, washington, united states':'98101','boston, massachusetts, united states':'02108','austin, texas, united states':'78701','chicago, illinois, united states':'60601',
 'miami, florida, united states':'33131','washington, district of columbia, united states':'20001','denver, colorado, united states':'80202','atlanta, georgia, united states':'30303',
 'palo alto, california, united states':'94301','san jose, california, united states':'95113','dallas, texas, united states':'75201','houston, texas, united states':'77002',
 'toronto, ontario, canada':'M5V 2T6','toronto, on':'M5V 2T6','north york, ontario, canada':'M3J 1P3','vancouver, british columbia, canada':'V6B 1A1','montreal, quebec, canada':'H3B 1A7',
 'ottawa, ontario, canada':'K1P 1J1','calgary, alberta, canada':'T2P 1J9','waterloo, ontario, canada':'N2L 3G1','mississauga, ontario, canada':'L5B 1M2'
};
const firstSegment=(value:string)=>value.split(',')[0].trim().toLowerCase();
/** LinkedIn renders the same place as "New York, NY" or "New York, New York, United States"; compare by city name. */
export function sameLocation(a:string,b:string):boolean {
 if(a.trim().toLowerCase()===b.trim().toLowerCase())return true;
 const postalOf=(value:string)=>(value.startsWith('postal:')?value.slice(7):POSTAL_CODES[value.trim().toLowerCase()]||'').replace(/\s+/g,'').toUpperCase();
 if(a.startsWith('postal:')||b.startsWith('postal:')){const x=postalOf(a),y=postalOf(b);return !!x&&x===y}
 const strip=(value:string)=>value.replace(/^[A-Z]\d[A-Z]\s?\d[A-Z]\d,\s*/i,'').replace(/^\d{5}(-\d{4})?,\s*/,'');
 return !!a&&!!b&&firstSegment(strip(a))===firstSegment(strip(b));
}
async function waitForControl(root:ParentNode,label:string,timeoutMs=4000):Promise<HTMLElement|null>{
 const end=Date.now()+timeoutMs;
 for(;;){try{return findField(root,label) as HTMLElement}catch{if(Date.now()>=end)return null}await new Promise(resolve=>setTimeout(resolve,100))}
}
/** City typeahead (e.g. Canada) or postal code then City list (e.g. United States). */
async function setLocation(root:ParentNode,location:string):Promise<void>{
 const view=(root as Node).ownerDocument?.defaultView??window;
 // After a country change LinkedIn re-renders the location controls.
 // LinkedIn shows a Postal code box for the US and Canada (also mid re-render after a country change); prefer that route.
 const known=location.startsWith('postal:')||!!POSTAL_CODES[location.trim().toLowerCase()];
 const end=Date.now()+4000;let postal:HTMLElement|null=null,city:HTMLElement|null=null;
 while(Date.now()<end){try{postal=findField(root,'Postal code') as HTMLElement}catch{postal=null}try{city=findField(root,'City') as HTMLElement}catch{city=null}if(postal||(city&&city.tagName==='INPUT'))break;await new Promise(resolve=>setTimeout(resolve,100))}
 if(!postal||(!known&&city&&city.tagName==='INPUT')){if(!city||city.tagName!=='INPUT')throw new Error('City field is unavailable');await selectAutocomplete(city,location);return}
 const code=location.startsWith('postal:')?location.slice(7):POSTAL_CODES[location.trim().toLowerCase()];
 if(!code)throw new Error(`No postal code is configured for ${location}`);
 setText(postal,code);
 const wanted=location.startsWith('postal:')?null:firstSegment(location);
 // Re-find the City list each pass: LinkedIn replaces it after the postal code (and country) change.
 const deadline=Date.now()+5000;let options:HTMLOptionElement[]=[];let select:HTMLSelectElement|null=null;
 while(Date.now()<deadline){
  try{const found=findField(root,'City');select=found instanceof view.HTMLSelectElement?found:null}catch{select=null}
  options=select?Array.from(select.options).filter(option=>!option.disabled&&!!option.value&&(wanted===null||firstSegment(option.textContent||'')===wanted)&&!/metropolitan|area/i.test(option.textContent||'')):[];
  if(wanted===null)options=options.slice(0,1);
  if(options.length)break;await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!select)throw new Error('City list did not appear for the postal code');
 if(options.length!==1)throw new Error(`Expected one City option for ${location}, found ${options.length}`);
 select.value=options[0].value;select.dispatchEvent(new view.Event('change',{bubbles:true}));
 if(select.value!==options[0].value)throw new Error('City option was not selected');
}
