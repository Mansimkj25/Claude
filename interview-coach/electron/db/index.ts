import Database from "better-sqlite3";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dir = app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, "interview-coach.sqlite"));
  db.pragma("journal_mode = WAL");
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  db.exec(schema);
  db.prepare("INSERT OR IGNORE INTO profile (id) VALUES (1)").run();
  return db;
}
