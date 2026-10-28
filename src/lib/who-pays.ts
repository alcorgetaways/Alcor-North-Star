export type WhoPaysResolution = { name: string; tools_included: boolean; influencer_included: boolean; version: string | null; custom: string | null };
export function whoPaysRows(tools: boolean, influencer: boolean) {
  const toolPayer = tools ? 'Included in the Alcor plan' : 'Add-on — hotel pays';
  return [
    { id: 1, item: 'Google Ads & Meta Ads spend', payer: 'Hotel pays Google/Meta directly — never in any Alcor plan' },
    { id: 2, item: 'Website creation', payer: 'Separate Alcor service — ₹15,000 to ₹5,00,000 by project' },
    { id: 3, item: 'Website hosting', payer: 'Alcor provides — ₹5,000/year maintenance fee' },
    { id: 4, item: 'Domain', payer: 'Hotel buys and pays, always' },
    { id: 5, item: 'CRM setup + subscription', payer: toolPayer },
    { id: 6, item: 'IVR licences & caller ID numbers', payer: toolPayer },
    { id: 7, item: 'WhatsApp automation tool + API balance', payer: toolPayer },
    { id: 8, item: 'Email marketing tool', payer: toolPayer },
    { id: 9, item: 'OTA commissions & paid OTA programmes', payer: 'Hotel pays the OTA directly' },
    { id: 10, item: 'Influencer stay + F&B', payer: influencer ? 'Hotel provides' : 'Not applicable — influencer marketing not in this plan' },
    { id: 11, item: 'Influencer travel, safaris & outside activities', payer: 'Not included' },
    { id: 12, item: 'Influencer fee', payer: 'None — Alcor shortlists barter/partner-collaboration influencers only' },
  ];
}