import { describe, it, expect } from 'vitest';
import { whoPaysRows } from './who-pays';
describe('owner-approved payer rules', () => {
  it('Diamond Start tools are hotel-paid add-ons', () => { expect(whoPaysRows(false,false).filter(r=>r.id>=5&&r.id<=8).every(r=>r.payer==='Add-on — hotel pays')).toBe(true); });
  it('Diamond Scale tools are included', () => { expect(whoPaysRows(true,true).filter(r=>r.id>=5&&r.id<=8).every(r=>r.payer==='Included in the Alcor plan')).toBe(true); });
  it('ads are never included even when tools are included', () => { expect(whoPaysRows(true,true)[0]?.payer).toBe('Hotel pays Google/Meta directly — never in any Alcor plan'); });
  it('hosting costs 5000 yearly and website is separate', () => { const rows=whoPaysRows(false,false); expect(rows[2]?.payer).toBe('Alcor provides — ₹5,000/year maintenance fee'); expect(rows[1]?.payer).toBe('Separate Alcor service — ₹15,000 to ₹5,00,000 by project'); });
});