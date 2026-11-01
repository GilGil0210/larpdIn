import {expect,it,vi} from 'vitest';
vi.mock('./ownership',()=>({resolveOwnProfile:vi.fn(),assertOwner:(a:string,b:string)=>{if(a!==b)throw Error('Wrong owner')}}));
import {importAbout} from './scanAbout';
const content={headline:'Original',location:'',industry:'',about:'',education:[]};
const form={url:'https://www.linkedin.com/in/example/edit/forms/summary/new/',title:'',fields:[{label:'Summary',value:'New summary',tag:'textarea',type:'textarea'}]};
it('imports one About field while preserving other content',()=>{expect(importAbout(form,'https://www.linkedin.com/in/example/',content)).toMatchObject({headline:'Original',about:'New summary'})});
it('rejects another owner and ambiguous fields',()=>{expect(()=>importAbout(form,'https://www.linkedin.com/in/other/',content)).toThrow();expect(()=>importAbout({...form,fields:[...form.fields,...form.fields]},'https://www.linkedin.com/in/example/',content)).toThrow()});
