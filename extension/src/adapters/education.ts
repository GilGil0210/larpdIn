import {findButton,findField,fieldValue} from '../form';
import type {z} from 'zod';
import type {educationRecord} from '../snapshot';
type RecordValue=z.infer<typeof educationRecord>;

/** Values read from a single edit form are partial until attachment inspection is implemented. */
export function readEducation(root:ParentNode,id:string,dates:{startMonth:number|null;startYear:number|null;endMonth:number|null;endYear:number|null}):RecordValue {
 if(!id) throw new Error('Education record identity is missing');
 const school=fieldValue(findField(root,'School'));
 if(!school.trim()) throw new Error('Education school is empty');
 const degree=fieldValue(findField(root,'Degree'));
 const fieldOfStudy=fieldValue(findField(root,'Field of study'));
 const grade=fieldValue(findField(root,'Grade'));
 const activities=fieldValue(findField(root,'Activities and societies'));
 const description=fieldValue(findField(root,'Description'));
 findButton(root,'Save');
 return {id,school,degree,fieldOfStudy,grade,activities,description,...dates,skills:[],media:[],attachmentsInspected:false};
}
/** Blank dates remain null; unexpected values fail rather than silently lose data. */
export function parseDatePart(value:string,kind:'month'|'year'):number|null {
 const normalized=value.trim();
 if(!normalized || normalized.toLowerCase()===kind) return null;
 if(!/^\d+$/.test(normalized)) throw new Error(`Invalid ${kind}`);
 const n=Number(normalized);
 if(!Number.isSafeInteger(n) || (kind==='month' ? n<1 || n>12 : n<1900 || n>2100)) throw new Error(`Invalid ${kind}`);
 return n;
}

import {setText,selectOption,selectAutocomplete} from '../form';
import {education} from '../contract';
type Education=z.infer<typeof education>;
export type DateControls={startMonth:HTMLSelectElement;startYear:HTMLSelectElement;endMonth:HTMLSelectElement;endYear:HTMLSelectElement};
/** Prepare an education editor only after all required controls and date options are present. Does not submit. */
export async function prepareEducation(root:ParentNode,raw:Education,dates:DateControls,months:{startMonth:number|null;endMonth:number|null}={startMonth:null,endMonth:null}):Promise<void> {
 const record=education.parse(raw);
 if(!record.school.trim()) throw new Error('School is required');
 const school=findField(root,'School'),degree=findField(root,'Degree'),field=findField(root,'Field of study'),grade=findField(root,'Grade'),activities=findField(root,'Activities and societies'),description=findField(root,'Description');
 findButton(root,'Save');
 const monthLabel=(control:HTMLSelectElement,value:number|null)=>{if(value===null)return 'Month';const names=['January','February','March','April','May','June','July','August','September','October','November','December'];const options=Array.from(control.options).filter(option=>!option.disabled&&(option.textContent?.trim()===String(value)||option.textContent?.trim()===names[value-1]));if(options.length!==1)throw new Error(`Expected one month option ${value}, found ${options.length}`);return options[0].textContent!.trim()};
 const desired:[HTMLSelectElement,string][]=[[dates.startMonth,monthLabel(dates.startMonth,months.startMonth)],[dates.startYear,record.startYear===null?'Year':String(record.startYear)],[dates.endMonth,monthLabel(dates.endMonth,months.endMonth)],[dates.endYear,record.endYear===null?'Year':String(record.endYear)]];
 for(const [control,label] of desired){
  if(!root.contains(control) || control.disabled) throw new Error('Education date control is unavailable');
  const options=Array.from(control.options).filter(option=>option.textContent?.trim()===label && !option.disabled);
  if(options.length!==1) throw new Error(`Expected one date option ${label}, found ${options.length}`);
 }
 // School must be selected from LinkedIn's suggestions; free text is not proof of a valid school.
 if(fieldValue(school)!==record.school)await selectAutocomplete(school,record.school);
 setText(degree,record.degree);setText(field,record.fieldOfStudy);setText(grade,record.grade);setText(activities,record.activities);setText(description,record.description);
 for(const [control,label] of desired) selectOption(control,label);
}
