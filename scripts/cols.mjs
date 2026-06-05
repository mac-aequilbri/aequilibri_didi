import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("C:/Users/antonim3/Documents/aequilibri_poc/db.sqlite3", { readOnly: true });
const tables = ["uc1_roofing_contact","uc1_roofing_ratecard","uc1_roofing_vendor","uc1_roofing_vendormaterialprice","uc1_roofing_quote","uc1_roofing_quoteitem"];
for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  const n = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  console.log(`\n${t} (${n} rows):\n  ${cols.join(", ")}`);
}
db.close();
