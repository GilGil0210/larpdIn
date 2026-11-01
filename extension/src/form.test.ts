// @vitest-environment jsdom
import {describe,it,expect,vi} from 'vitest';
import {findField,findButton,setText,selectOption,fieldValue} from './form';
describe('form matching',()=>{
 it('finds exact labels, sets text and emits events',()=>{document.body.innerHTML='<label for="headline">Headline*</label><textarea id="headline"></textarea><button>Save</button>';const f=findField(document,'Headline');const input=vi.fn();f.addEventListener('input',input);setText(f,'New headline');expect(fieldValue(f)).toBe('New headline');expect(input).toHaveBeenCalledOnce();expect(findButton(document,'Save').textContent).toBe('Save')});
 it('rejects duplicate controls and missing buttons',()=>{document.body.innerHTML='<input aria-label="School"><input aria-label="School">';expect(()=>findField(document,'School')).toThrow('found 2');expect(()=>findButton(document,'Save')).toThrow('found 0')});
 it('selects an exact option and rejects ambiguous options',()=>{document.body.innerHTML='<label>Year<select><option value="">Year</option><option value="2025">2025</option></select></label>';const f=findField(document,'Year');selectOption(f,'2025');expect(fieldValue(f)).toBe('2025');expect(()=>selectOption(f,'2026')).toThrow()});
});

it('reads and changes a uniquely labelled editable textbox',()=>{document.body.innerHTML='<div role="textbox" contenteditable="true" aria-label="Headline">Old</div>';const field=findField(document,'Headline');expect(fieldValue(field)).toBe('Old');setText(field,'New');expect(fieldValue(field)).toBe('New')});
