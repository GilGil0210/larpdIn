import {expect,it} from 'vitest';
import {profileKey} from './storage';
it('normalizes profile URLs for storage',()=>{expect(profileKey('https://www.linkedin.com/in/Example/')).toBe('profile:/in/example')});
it('rejects unrelated and ambiguous URLs',()=>{for(const url of ['https://evil.com/in/name','https://www.linkedin.com/in/name?x=1','https://www.linkedin.com/feed/']) expect(()=>profileKey(url)).toThrow()});
