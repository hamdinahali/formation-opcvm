const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'formation-opcvm.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function seedOnce(table, countSql, insertSql, rows) {
  const total = db.prepare(countSql).get().total;
  if (total > 0) return;
  const insert = db.prepare(insertSql);
  const trx = db.transaction(() => rows.forEach((row) => insert.run(row)));
  trx();
}

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('etudiant','investisseur','formateur','admin')),
      actif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS formations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titre TEXT NOT NULL,
      description TEXT NOT NULL,
      categorie TEXT NOT NULL CHECK(categorie IN ('investisseur','etudiant')),
      type TEXT NOT NULL CHECK(type IN ('enligne','presentiel')),
      niveau TEXT NOT NULL,
      duree TEXT NOT NULL,
      prix REAL NOT NULL DEFAULT 0,
      places_max INTEGER NOT NULL DEFAULT 0,
      places_dispo INTEGER NOT NULL DEFAULT 0,
      actif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      formation_id INTEGER NOT NULL,
      titre TEXT NOT NULL,
      ordre INTEGER NOT NULL DEFAULT 1,
      duree TEXT,
      FOREIGN KEY (formation_id) REFERENCES formations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ressources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      formation_id INTEGER NOT NULL,
      titre TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('pdf','video')),
      url TEXT,
      fichier TEXT,
      taille_ko INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (formation_id) REFERENCES formations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      formation_id INTEGER NOT NULL,
      statut TEXT NOT NULL DEFAULT 'en_attente' CHECK(statut IN ('en_attente','confirme','annule','termine')),
      paiement TEXT NOT NULL DEFAULT 'en_attente' CHECK(paiement IN ('gratuit','en_attente','paye')),
      montant_paye REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, formation_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (formation_id) REFERENCES formations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS progressions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      formation_id INTEGER NOT NULL,
      progression INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, formation_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (formation_id) REFERENCES formations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      formation_id INTEGER NOT NULL,
      date_debut TEXT NOT NULL,
      date_fin TEXT NOT NULL,
      lieu TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'ouverte',
      FOREIGN KEY (formation_id) REFERENCES formations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      email TEXT NOT NULL,
      sujet TEXT NOT NULL,
      message TEXT NOT NULL,
      lu INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS temoignages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      formation_id INTEGER,
      nom TEXT NOT NULL,
      role TEXT NOT NULL,
      message TEXT NOT NULL,
      note INTEGER NOT NULL DEFAULT 5,
      valide INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (formation_id) REFERENCES formations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS societes_bourse (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      sigle TEXT,
      logo_url TEXT,
      site_web TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS performances_societes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      societe_id INTEGER,
      annee INTEGER NOT NULL,
      trimestre INTEGER CHECK(trimestre BETWEEN 1 AND 4),
      rendement_pct REAL,
      volume_echange INTEGER,
      nombre_clients INTEGER,
      actif_gere INTEGER,
      note_globale REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (societe_id) REFERENCES societes_bourse(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS intermediaires (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      type TEXT CHECK(type IN ('courtier','gestionnaire','conseiller','banque')),
      ville TEXT,
      telephone TEXT,
      email TEXT,
      site_web TEXT,
      description TEXT,
      agree_amf INTEGER DEFAULT 1,
      note_moyenne REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS avis_intermediaires (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      intermediaire_id INTEGER,
      user_id INTEGER,
      note INTEGER CHECK(note BETWEEN 1 AND 5),
      commentaire TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, intermediaire_id),
      FOREIGN KEY (intermediaire_id) REFERENCES intermediaires(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS performances_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      periode TEXT NOT NULL,
      rendement_pct REAL DEFAULT 0,
      nb_cours_finis INTEGER DEFAULT 0,
      score_moyen REAL DEFAULT 0,
      rang INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS classement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      type TEXT CHECK(type IN ('etudiant','investisseur')),
      score REAL DEFAULT 0,
      mois TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS societes_etrangeres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      pays TEXT NOT NULL,
      indice TEXT,
      secteur TEXT,
      ticker TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS performances_etrangeres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      societe_id INTEGER,
      annee INTEGER,
      trimestre INTEGER,
      rendement_pct REAL,
      valeur_action REAL,
      devise TEXT DEFAULT 'USD',
      variation_pct REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (societe_id) REFERENCES societes_etrangeres(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commentaires (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      type_cible TEXT CHECK(type_cible IN ('cours','societe','intermediaire','general')),
      cible_id INTEGER DEFAULT NULL,
      contenu TEXT NOT NULL,
      note INTEGER DEFAULT NULL CHECK(note BETWEEN 1 AND 5),
      approuve INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commentaire_id INTEGER,
      user_id INTEGER,
      type TEXT CHECK(type IN ('like','dislike')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, commentaire_id),
      FOREIGN KEY (commentaire_id) REFERENCES commentaires(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS profils_publics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE,
      bio TEXT,
      linkedin TEXT,
      specialite TEXT,
      experience TEXT,
      ville TEXT,
      visible INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages_membres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expediteur INTEGER,
      destinataire INTEGER,
      sujet TEXT NOT NULL,
      contenu TEXT NOT NULL,
      lu INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (expediteur) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (destinataire) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  seedOnce('societes_bourse', 'SELECT COUNT(*) AS total FROM societes_bourse', `
    INSERT INTO societes_bourse (nom, sigle, logo_url, site_web, description) VALUES (@nom, @sigle, @logo_url, @site_web, @description)
  `, [
    { nom: 'Tunisie Valeurs', sigle: 'TV', logo_url: '', site_web: 'https://www.tunisievaleurs.com', description: 'Intermédiaire en bourse et gestionnaire d actifs de référence en Tunisie.' },
    { nom: 'Arab Tunisian Invest', sigle: 'ATI', logo_url: '', site_web: 'https://www.atb.tn', description: 'Société d intermédiation adossée au groupe Arab Tunisian Bank.' },
    { nom: 'Attijari Intermédiation', sigle: 'AI', logo_url: '', site_web: 'https://www.attijaribank.com.tn', description: 'Intermédiaire en bourse du groupe Attijari bank Tunisie.' },
    { nom: 'BIAT Capital', sigle: 'BC', logo_url: '', site_web: 'https://www.biatcapital.com', description: 'Filiale spécialisée dans les marchés financiers et la gestion de portefeuille.' },
    { nom: 'Amen Invest', sigle: 'AIv', logo_url: '', site_web: 'https://www.ameninvest.com', description: 'Acteur tunisien du conseil financier, de l intermédiation et de la gestion.' },
    { nom: 'MAC SA', sigle: 'MAC', logo_url: '', site_web: 'https://www.macsa.com.tn', description: 'Intermédiaire en bourse tunisien actif sur le marché actions et OPCVM.' }
  ]);

  const societeIds = db.prepare('SELECT id, nom FROM societes_bourse ORDER BY id').all();
  if (db.prepare('SELECT COUNT(*) AS total FROM performances_societes').get().total === 0) {
    const insertPerf = db.prepare(`
      INSERT INTO performances_societes (societe_id, annee, trimestre, rendement_pct, volume_echange, nombre_clients, actif_gere, note_globale)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const trx = db.transaction(() => {
      societeIds.forEach((s, i) => {
        insertPerf.run(s.id, 2024, 4, [8.2, 5.7, 4.8, 7.4, 3.9, 6.1][i], 12000000 + i * 2300000, 4200 + i * 360, 180000000 + i * 28000000, 4.5 - i * 0.15);
        insertPerf.run(s.id, 2025, 1, [9.1, 6.4, 5.2, 8.0, 4.6, 6.8][i], 13500000 + i * 2100000, 4500 + i * 380, 195000000 + i * 30000000, 4.6 - i * 0.12);
      });
    });
    trx();
  }

  seedOnce('intermediaires', 'SELECT COUNT(*) AS total FROM intermediaires', `
    INSERT INTO intermediaires (nom, type, ville, telephone, email, site_web, description, agree_amf, note_moyenne)
    VALUES (@nom, @type, @ville, @telephone, @email, @site_web, @description, 1, @note_moyenne)
  `, [
    { nom: 'Tunisie Valeurs', type: 'gestionnaire', ville: 'Tunis', telephone: '+216 71 189 600', email: 'contact@tunisievaleurs.com', site_web: 'https://www.tunisievaleurs.com', description: 'Gestion, intermédiation et analyse financière pour investisseurs particuliers et institutionnels.', note_moyenne: 4.7 },
    { nom: 'MAC SA', type: 'courtier', ville: 'Tunis', telephone: '+216 71 843 000', email: 'contact@macsa.com.tn', site_web: 'https://www.macsa.com.tn', description: 'Courtier tunisien proposant accès marché, recherche et accompagnement.', note_moyenne: 4.3 },
    { nom: 'BIAT Capital', type: 'banque', ville: 'Tunis', telephone: '+216 71 131 000', email: 'contact@biatcapital.com', site_web: 'https://www.biatcapital.com', description: 'Services de marché et de gestion liés au groupe BIAT.', note_moyenne: 4.5 },
    { nom: 'Amen Invest', type: 'conseiller', ville: 'Tunis', telephone: '+216 71 148 000', email: 'contact@ameninvest.com', site_web: 'https://www.ameninvest.com', description: 'Conseil financier, intermédiation et gestion de portefeuilles.', note_moyenne: 4.2 },
    { nom: 'Attijari Intermédiation', type: 'banque', ville: 'Tunis', telephone: '+216 71 141 400', email: 'contact@attijari.com.tn', site_web: 'https://www.attijaribank.com.tn', description: 'Services de bourse et d investissement du groupe Attijari bank.', note_moyenne: 4.1 },
    { nom: 'Arab Tunisian Invest', type: 'gestionnaire', ville: 'Tunis', telephone: '+216 71 351 155', email: 'contact@atb.tn', site_web: 'https://www.atb.tn', description: 'Intermédiation et gestion financière pour clients ATB.', note_moyenne: 4.0 },
    { nom: 'CGF', type: 'courtier', ville: 'Sfax', telephone: '+216 74 200 100', email: 'contact@cgf.tn', site_web: '', description: 'Accompagnement régional en investissement et ordres de bourse.', note_moyenne: 3.9 },
    { nom: 'SICOFI', type: 'conseiller', ville: 'Sousse', telephone: '+216 73 225 600', email: 'contact@sicofi.tn', site_web: '', description: 'Conseil et suivi d allocation pour épargnants et PME.', note_moyenne: 4.0 }
  ]);

  seedOnce('societes_etrangeres', 'SELECT COUNT(*) AS total FROM societes_etrangeres', `
    INSERT INTO societes_etrangeres (nom, pays, indice, secteur, ticker, description)
    VALUES (@nom, @pays, @indice, @secteur, @ticker, @description)
  `, [
    { nom: 'TotalEnergies', pays: 'France', indice: 'CAC40', secteur: 'Energie', ticker: 'TTE', description: 'Groupe énergétique international coté à Paris.' },
    { nom: 'LVMH', pays: 'France', indice: 'CAC40', secteur: 'Luxe', ticker: 'MC', description: 'Leader mondial du luxe.' },
    { nom: 'BNP Paribas', pays: 'France', indice: 'CAC40', secteur: 'Banque', ticker: 'BNP', description: 'Banque européenne diversifiée.' },
    { nom: 'Apple', pays: 'USA', indice: 'S&P500', secteur: 'Technologie', ticker: 'AAPL', description: 'Groupe technologique américain.' },
    { nom: 'Microsoft', pays: 'USA', indice: 'S&P500', secteur: 'Technologie', ticker: 'MSFT', description: 'Logiciels, cloud et IA.' },
    { nom: 'Attijariwafa Bank', pays: 'Maroc', indice: 'MASI', secteur: 'Banque', ticker: 'ATW', description: 'Groupe bancaire marocain panafricain.' },
    { nom: 'Maroc Telecom', pays: 'Maroc', indice: 'MASI', secteur: 'Telecom', ticker: 'IAM', description: 'Opérateur télécom coté à Casablanca.' },
    { nom: 'Sonatrach', pays: 'Algérie', indice: 'Non coté', secteur: 'Energie', ticker: 'SONA', description: 'Groupe énergétique algérien de référence.' }
  ]);

  const foreignIds = db.prepare('SELECT id FROM societes_etrangeres ORDER BY id').all();
  if (db.prepare('SELECT COUNT(*) AS total FROM performances_etrangeres').get().total === 0) {
    const insertForeignPerf = db.prepare(`
      INSERT INTO performances_etrangeres (societe_id, annee, trimestre, rendement_pct, valeur_action, devise, variation_pct)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const vals = [
      [12.4, 67.8, 'EUR', 2.1], [6.8, 731.2, 'EUR', -1.4], [9.5, 72.4, 'EUR', 1.8], [18.7, 196.3, 'USD', 3.5],
      [21.2, 428.1, 'USD', 4.1], [7.6, 485.0, 'MAD', 1.3], [4.3, 91.2, 'MAD', 0.8], [5.1, 100.0, 'DZD', 0.6]
    ];
    const trx = db.transaction(() => foreignIds.forEach((s, i) => insertForeignPerf.run(s.id, 2025, 1, ...vals[i])));
    trx();
  }

  const userRows = db.prepare('SELECT id, role, nom, prenom FROM users WHERE role IN (?, ?) ORDER BY id').all('etudiant', 'investisseur');
  if (userRows.length && db.prepare('SELECT COUNT(*) AS total FROM classement').get().total === 0) {
    const insertClassement = db.prepare('INSERT INTO classement (user_id, type, score, mois) VALUES (?, ?, ?, ?)');
    const insertUserPerf = db.prepare('INSERT INTO performances_users (user_id, periode, rendement_pct, nb_cours_finis, score_moyen, rang) VALUES (?, ?, ?, ?, ?, ?)');
    const trx = db.transaction(() => userRows.forEach((u, i) => {
      const type = u.role === 'investisseur' ? 'investisseur' : 'etudiant';
      insertClassement.run(u.id, type, 88 - i * 4, '2025-01');
      insertUserPerf.run(u.id, '2025-T1', type === 'investisseur' ? 7.5 - i : 2.5, 3 + i, 84 - i * 3, i + 1);
    }));
    trx();
  }
}

db.initDB = initDB;
module.exports = db;
