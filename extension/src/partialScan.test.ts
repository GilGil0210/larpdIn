import {expect,it} from 'vitest';
import {importIntro} from './partialScan';
import type {Inspection} from './inspection';
const content={headline:'',location:'',industry:'',about:'About',education:[]};
const make=():Inspection=>({url:'https://www.linkedin.com/in/me-name/edit/intro/',title:'LinkedIn',fields:[['First name','A'],['Last name','B'],['Headline','Student'],['City','Toronto'],['Country/Region','Canada'],['Industry','Technology']].map(([label,value])=>({label,value,tag:'input',type:'text'}))});
it('imports intro without overwriting other sections',()=>{const result=importIntro(make(),content);expect(result.profileUrl).toBe('https://www.linkedin.com/in/me-name/');expect(result.content).toMatchObject({headline:'Student',location:'Toronto',industry:'Technology',about:'About'})});
it('fails closed on wrong page or ambiguous labels',()=>{const sample=make();sample.fields.push(sample.fields[2]);expect(()=>importIntro(sample,content)).toThrow();expect(()=>importIntro({...make(),url:'https://www.linkedin.com/in/me-name/'},content)).toThrow()});
