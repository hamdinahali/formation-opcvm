const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'formation-opcvm.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
