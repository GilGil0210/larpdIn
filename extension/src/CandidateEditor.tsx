import React from 'react';
import type {z} from 'zod';
import type {candidate,education} from './contract';

type Candidate=z.infer<typeof candidate>;
type Education=z.infer<typeof education>;
const emptyEducation=():Education=>({school:'',degree:'',fieldOfStudy:'',startYear:null,endYear:null,grade:'',activities:'',description:''});
export function CandidateEditor({value,onChange,onSave,index}:{value:Candidate;onChange:(value:Candidate)=>void;onSave:()=>void;index:number}){
 const update=(patch:Partial<Candidate>)=>onChange({...value,...patch});
 const updateContent=(patch:Partial<Candidate['content']>)=>update({content:{...value.content,...patch}});
 const updateEducation=(i:number,patch:Partial<Education>)=>updateContent({education:value.content.education.map((item,j)=>i===j?{...item,...patch}:item)});
 return <section aria-labelledby={`candidate-${index}`}><h2 id={`candidate-${index}`}>Candidate {index+1}</h2>
  <label>Persona name<input value={value.name} onChange={e=>update({name:e.target.value})}/></label>
  <label>Persona description<textarea value={value.description} onChange={e=>update({description:e.target.value})}/></label>
  <label>Headline<input value={value.content.headline} onChange={e=>updateContent({headline:e.target.value})}/></label>
  <label>Location<input value={value.content.location} onChange={e=>updateContent({location:e.target.value})}/></label>
  <label>Industry<input value={value.content.industry} onChange={e=>updateContent({industry:e.target.value})}/></label>
  <label>About<textarea rows={5} value={value.content.about} onChange={e=>updateContent({about:e.target.value})}/></label>
  <h3>Education</h3>{value.content.education.map((item,i)=><fieldset key={i}><legend>Education {i+1}</legend>
   <label>School<input value={item.school} onChange={e=>updateEducation(i,{school:e.target.value})}/></label>
   <label>Degree<input value={item.degree} onChange={e=>updateEducation(i,{degree:e.target.value})}/></label>
   <label>Field of study<input value={item.fieldOfStudy} onChange={e=>updateEducation(i,{fieldOfStudy:e.target.value})}/></label>
   <label>Start year<input type="number" value={item.startYear??''} onChange={e=>updateEducation(i,{startYear:e.target.value===''?null:e.target.valueAsNumber})}/></label>
   <label>End year<input type="number" value={item.endYear??''} onChange={e=>updateEducation(i,{endYear:e.target.value===''?null:e.target.valueAsNumber})}/></label>
   <label>Grade<input value={item.grade} onChange={e=>updateEducation(i,{grade:e.target.value})}/></label>
   <label>Activities<textarea value={item.activities} onChange={e=>updateEducation(i,{activities:e.target.value})}/></label>
   <label>Description<textarea value={item.description} onChange={e=>updateEducation(i,{description:e.target.value})}/></label>
   <button type="button" onClick={()=>updateContent({education:value.content.education.filter((_,j)=>i!==j)})}>Remove education {i+1}</button>
  </fieldset>)}
  <button type="button" onClick={()=>updateContent({education:[...value.content.education,emptyEducation()]})}>Add education</button>{' '}
  <button type="button" onClick={onSave}>Save candidate</button>
 </section>
}
