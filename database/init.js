const bcrypt = require('bcryptjs');
const db = require('./db');

const hash = (password) => bcrypt.hashSync(password, 10);

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
`);

const existing = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
if (existing > 0) {
  console.log('Base déjà initialisée. Aucune donnée seed ajoutée.');
  process.exit(0);
}

const insertUser = db.prepare(`
  INSERT INTO users (nom, prenom, email, password, role, actif)
  VALUES (@nom, @prenom, @email, @password, @role, 1)
`);

const insertFormation = db.prepare(`
  INSERT INTO formations (titre, description, categorie, type, niveau, duree, prix, places_max, places_dispo, actif)
  VALUES (@titre, @description, @categorie, @type, @niveau, @duree, @prix, @places_max, @places_dispo, 1)
`);

const insertModule = db.prepare('INSERT INTO modules (formation_id, titre, ordre, duree) VALUES (?, ?, ?, ?)');
const insertResource = db.prepare('INSERT INTO ressources (formation_id, titre, type, url, fichier, taille_ko) VALUES (?, ?, ?, ?, ?, ?)');
const insertSession = db.prepare('INSERT INTO sessions (formation_id, date_debut, date_fin, lieu, statut) VALUES (?, ?, ?, ?, ?)');
const insertInscription = db.prepare('INSERT INTO inscriptions (user_id, formation_id, statut, paiement, montant_paye) VALUES (?, ?, ?, ?, ?)');
const insertProgress = db.prepare('INSERT INTO progressions (user_id, formation_id, progression) VALUES (?, ?, ?)');
const insertContact = db.prepare('INSERT INTO contacts (nom, email, sujet, message, lu) VALUES (?, ?, ?, ?, ?)');
const insertTestimonial = db.prepare('INSERT INTO temoignages (user_id, formation_id, nom, role, message, note, valide) VALUES (?, ?, ?, ?, ?, ?, ?)');

const trx = db.transaction(() => {
  const adminId = insertUser.run({ nom: 'Admin', prenom: 'Formation', email: 'admin@opcvm.tn', password: hash('Admin@2024'), role: 'admin' }).lastInsertRowid;
  const formateurId = insertUser.run({ nom: 'Bensalah', prenom: 'Karim', email: 'karim.bensalah@opcvm.tn', password: hash('Formateur@2024'), role: 'formateur' }).lastInsertRowid;
  const sarraId = insertUser.run({ nom: 'Mansouri', prenom: 'Sarra', email: 'sarra@test.tn', password: hash('Test@2024'), role: 'etudiant' }).lastInsertRowid;
  const yassineId = insertUser.run({ nom: 'Trabelsi', prenom: 'Yassine', email: 'yassine@test.tn', password: hash('Test@2024'), role: 'investisseur' }).lastInsertRowid;

  const formations = [
    ['Parcours Étudiants Marchés & OPCVM', 'Programme académique complet sur les marchés financiers, la Bourse de Tunis et les OPCVM.', 'etudiant', 'enligne', 'Débutant', '12 semaines', 0, 50, 32],
    ['Initiation Bourse et Simulateur', 'Apprenez à lire les cours de la Bourse et gérez un portefeuille virtuel.', 'etudiant', 'enligne', 'Débutant', '4 semaines', 79, 30, 18]
  ];

  const ids = formations.map((f) => insertFormation.run({
    titre: f[0], description: f[1], categorie: f[2], type: f[3], niveau: f[4], duree: f[5], prix: f[6], places_max: f[7], places_dispo: f[8]
  }).lastInsertRowid);

  ids.forEach((formationId) => {
    ['Fondamentaux et contexte tunisien', 'Lecture des documents fonds', 'Risque, performance et frais', 'Cas pratique guidé'].forEach((title, index) => {
      insertModule.run(formationId, title, index + 1, `${45 + index * 15} min`);
    });
    insertResource.run(formationId, 'Vidéo d’introduction', 'video', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', null, 0);
  });

  insertInscription.run(sarraId, ids[0], 'confirme', 'gratuit', 0);
  insertInscription.run(sarraId, ids[1], 'confirme', 'paye', 79);
  insertInscription.run(yassineId, ids[0], 'termine', 'paye', 0);
  insertInscription.run(yassineId, ids[1], 'confirme', 'paye', 79);

  insertProgress.run(sarraId, ids[0], 62);
  insertProgress.run(sarraId, ids[1], 35);
  insertProgress.run(yassineId, ids[0], 100);
  insertProgress.run(yassineId, ids[1], 58);

  insertContact.run('Nadia Kefi', 'nadia@example.tn', 'Formation en ligne', 'Je souhaite en savoir plus sur les parcours disponibles.', 0);
  insertContact.run('Omar Saidi', 'omar@example.tn', 'Partenariat université', 'Pouvez-vous proposer un parcours pour nos étudiants en finance ?', 0);

  insertTestimonial.run(yassineId, ids[0], 'Yassine Trabelsi', 'Investisseur particulier', 'La formation donne une vraie méthode pour comparer les fonds au-delà du rendement affiché.', 5, 1);
  insertTestimonial.run(sarraId, ids[1], 'Sarra Mansouri', 'Étudiante en finance', 'Le simulateur rend les notions de risque et diversification beaucoup plus concrètes.', 5, 1);

  console.log('Seed terminé.');
  console.log('admin@opcvm.tn / Admin@2024');
  console.log('karim.bensalah@opcvm.tn / Formateur@2024');
  console.log('sarra@test.tn / Test@2024');
  console.log('yassine@test.tn / Test@2024');
});

trx();
