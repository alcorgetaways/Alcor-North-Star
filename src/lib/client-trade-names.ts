export type ClientTradeNames = { member: string; tradeName: string };

const entries: Array<ClientTradeNames & { aliases?: string[] }> = [
  { member: "Simcha by Crafted Celebration", tradeName: "Crafted Celebration Private Limited", aliases: ["Simcha Island- By crafted creations"] },
  { member: "Dental centre", tradeName: "Dental centre" },
  { member: "Hotel Morya Regency", tradeName: "Hotel Morya Regency", aliases: ["Hotel Maurya Bhopal", "Hotel Marya Regency"] },
  { member: "SOL Escapes", tradeName: "SOL Escapes LLP", aliases: ["Reflections By SOL Escapes"] },
  { member: "Season Jawai", tradeName: "Leopards' Lair Jawai Private Limited", aliases: ["Seasons Jawai"] },
  { member: "Melody Moon", tradeName: "Melody Moon Desert Camp", aliases: ["Melody Moon Resort"] },
  { member: "Countryside Villa - Dhanaulti", tradeName: "Uttrakhand", aliases: ["Countryside Villa By Alcor"] },
  { member: "Yadu's Jawai By Alcor", tradeName: "AASHAPURNA HOSPITALITY LLP", aliases: ["Yadus Jawai - By Alcor", "Yadu's Jawai - By Alcor"] },
  { member: "Kutani Bagh", tradeName: "Kutani Bagh", aliases: ["Kutani Bagh Sariska"] },
  { member: "Hardys Retreat", tradeName: "Hardys Retreat" },
  { member: "Cherilyn Monta Resort", tradeName: "Cherilyn Monta Resort" },
  { member: "Yogu's Woodside", tradeName: "LONG ISLAND RESORTS" },
  { member: "Sariska Tiger Lodge", tradeName: "Sariska Tiger Lodge" },
  { member: "Brahmaputra Jungle", tradeName: "Brahmaputra Jungle Resorts Pvt Ltd" },
  { member: "EXCEL HOTELS & RESORTS", tradeName: "EXCEL HOTELS & RESORTS", aliases: ["Excel Hotels-Banyan-Jim-Corbett", "Excel Hotels-Bhimtal"] },
  { member: "Spring Hill Resort", tradeName: "Spring Hill Resorts Private Limited" },
  { member: "Cabana Affair", tradeName: "CABANA AFFAIR" },
  { member: "Asiatic Lion Lodge", tradeName: "ECOTRAILS HOSPITALITY PRIVATE LIMITED" },
  { member: "Black Buck", tradeName: "Terra Ecotourism Private Limited", aliases: ["Blackbuck Safari Lodge"] },
  { member: "Yaan Udaipur", tradeName: "Fountain Resorts Pvt Ltd" },
  { member: "Banjara Hotel", tradeName: "M/S HOTEL BANJARA" },
  { member: "SALVUS HOTELS PRIVATE LIMITED", tradeName: "Narayana Palace", aliases: ["The Narayana Palace", "Narayana Palace"] },
];

const normalize = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
const namesByLookup = new Map<string, ClientTradeNames>();
for (const { member, tradeName, aliases = [] } of entries) {
  for (const name of [member, tradeName, ...aliases]) namesByLookup.set(normalize(name), { member, tradeName });
}

export function clientTradeNamesFor(hotelName: string): ClientTradeNames | null {
  return namesByLookup.get(normalize(hotelName)) ?? null;
}
