import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const [, , databaseArgument, outputArgument] = process.argv;

if (!databaseArgument || !outputArgument) {
  console.error("Usage: node scripts/export-sqlite-for-d1.mjs <database.sqlite> <output.sql>");
  process.exit(1);
}

const databasePath = path.resolve(databaseArgument);
const outputPath = path.resolve(outputArgument);
const tables = ["ingredients", "recipes", "recipe_ingredients", "recipe_steps"];
const database = new DatabaseSync(databasePath, { readOnly: true });
const lines = [];

database.exec("BEGIN");
try {
  for (const table of tables) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
    const rows = database.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
    for (const row of rows) {
      const values = columns.map((column) => toSqlLiteral(row[column])).join(", ");
      lines.push(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values});`);
    }
  }
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
} finally {
  database.close();
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Exported ${lines.length} rows to ${outputPath}`);

function toSqlLiteral(value) {
  if (value === null) return "NULL";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}
