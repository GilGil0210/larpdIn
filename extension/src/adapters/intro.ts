import {findField,findButton,setText,fieldValue} from '../form';

/** Validate all controls observed in the intro form before changing anything. */
export function readIntro(root:ParentNode) {
 const headline=findField(root,'Headline');
 const country=findField(root,'Country/Region');
 const city=findField(root,'City');
 const industry=findField(root,'Industry');
 // Ensure the identity fields and save control exist so this is the expected form.
 findField(root,'First name'); findField(root,'Last name'); findButton(root,'Save');
 return {headline:fieldValue(headline),country:fieldValue(country),city:fieldValue(city),industry:fieldValue(industry)};
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
 const headline=findField(root,'Headline'),country=findField(root,'Country/Region'),city=findField(root,'City'),industry=findField(root,'Industry');
 if(target.country&&target.country!==before.country)await selectAutocomplete(country,target.country);
 // Resolve both suggestions before touching unrelated fields. A failed selection leaves only unsaved form edits.
 if(target.location!==before.city){if(target.location)await selectAutocomplete(city,target.location);else setText(city,'')}
 if(target.industry!==before.industry){if(target.industry)await selectAutocomplete(industry,target.industry);else setText(industry,'')}
 setText(headline,target.headline);
 const after=readCompleteIntro(root);
 for(const key of ['firstName','lastName','additionalName','pronouns','education'] as const) if(after[key]!==before[key])throw new Error(`Intro ${key} changed unexpectedly`);
 if((target.country&&after.country!==target.country)||after.headline!==target.headline || after.city!==target.location || after.industry!==target.industry)throw new Error('Intro values do not match target');
}
