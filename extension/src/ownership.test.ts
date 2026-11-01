import {it,expect} from 'vitest';
import {assertOwner} from './ownership';
it('compares normalized profile identities and rejects another account',()=>{expect(()=>assertOwner('https://www.linkedin.com/in/Example/','https://www.linkedin.com/in/example')).not.toThrow();expect(()=>assertOwner('https://www.linkedin.com/in/other/','https://www.linkedin.com/in/example/')).toThrow();expect(()=>assertOwner('https://evil.com/in/example/','https://www.linkedin.com/in/example/')).toThrow()});
