import {describe,it,expect} from 'vitest';
import {parseCsv,guessMapping,validateRows} from './import';
describe('CSV invoice import',()=>{
 it('parses quoted commas, escaped quotes, CRLF and newlines',()=>expect(parseCsv('a,b\r\n"one, two","say ""hi"""\r\n"multi\nline",ok')).toEqual([['a','b'],['one, two','say "hi"'],['multi\nline','ok']]));
 it('rejects malformed quotes',()=>expect(()=>parseCsv('a,b\n"unterminated,b')).toThrow());
 it('validates a mapped import',()=>{const h=['description','quantity_packs','pack_cost_gbp','vat_rate'];const r=validateRows(h,[['Rice','2','1.20','0']],guessMapping(h));expect(r.errors).toEqual([]);expect(r.lines[0].packCostPence).toBe(120);});
 it('rejects invalid quantity and VAT',()=>{const h=['description','quantity_packs','pack_cost_gbp','vat_rate'];const r=validateRows(h,[['Rice','0','1.20','19']],guessMapping(h));expect(r.errors.length).toBe(1);});
});
