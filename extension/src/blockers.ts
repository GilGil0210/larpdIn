import type {Blocker} from './public-api';
/** Convert known preflight failures into stable UI actions without exposing profile data. */
export function classifyBlocker(message:string):Blocker {
 const value=message.toLowerCase();
 if(value.includes('education')&&(value.includes('attachment')||value.includes('media')||value.includes('skills')))return {code:'education_attachments_unavailable',message:'Education attachments could not be captured and restored. Review switch progress before retrying.',section:'education',action:'review'};
 if(value.includes('education')&&(value.includes('complet')||value.includes('list')))return {code:'education_collection_incomplete',message:'The full education list could not be verified. Scan again after LinkedIn finishes loading.',section:'education',action:'scan'};
 if(value.includes('about')&&(value.includes('empty')||value.includes('absent')))return {code:'about_presence_unavailable',message:'The original empty or absent About section cannot yet be restored reliably.',section:'about',action:'review'};
 if(value.includes('profile')&&(value.includes('owner')||value.includes('different')||value.includes('signed-in')))return {code:'profile_mismatch',message:'The signed-in LinkedIn profile does not match the connected profile.',section:'profile',action:'connect'};
 if(value.includes('storage')||value.includes('quota'))return {code:'storage_unavailable',message:'Restoration data could not be stored safely. Check available storage and retry.',section:'storage',action:'retry'};
 if(value.includes('suggestion')||value.includes('ambiguous'))return {code:'selection_unresolved',message:'LinkedIn did not provide a unique matching selection. Review the requested values.',section:'intro',action:'review'};
 return {code:'preflight_failed',message:'The switch could not pass its safety checks. Review diagnostics and retry.',section:'operation',action:'retry'};
}
