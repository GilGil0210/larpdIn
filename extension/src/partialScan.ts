import type {Inspection} from './inspection';
import {profileKey} from './storage';
import type {Profile} from './contract';
/** Import only a recognized intro form. This result is not a complete snapshot. */
export function importIntro(result:Inspection,current:Profile):{profileUrl:string;content:Profile} {
 const url=new URL(result.url); const match=url.pathname.match(/^\/in\/([^/]+)\/edit\/intro\/?$/);
 if(!match) throw new Error('Open the LinkedIn Edit intro form first.');
 const profileUrl=`https://www.linkedin.com/in/${match[1]}/`;profileKey(profileUrl);
 const get=(label:string)=>{const fields=result.fields.filter(f=>f.label.replace(/\s*\*\s*$/,'').trim().toLowerCase()===label.toLowerCase());if(fields.length!==1) throw new Error(`Expected one ${label} field, found ${fields.length}`);return fields[0].value};
 // These checks ensure this is the observed form, not a similar page.
 get('First name');get('Last name');
 const headline=get('Headline'),city=get('City'),country=get('Country/Region'),industry=get('Industry');
 return {profileUrl,content:{...current,headline,location:city || country,industry}};
}
