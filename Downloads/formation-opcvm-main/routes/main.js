const express = require('express');
const db = require('../database/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function formationsQuery({ categorie, type } = {}) {
  const where = ['actif = 1'];
  const params = [];
  if (categorie) {
    where.push('categorie = ?');
    params.push(categorie);
  }
  if (type) {
    where.push('type = ?');
    params.push(type);
  }
  return db.prepare(`SELECT * FROM formations WHERE ${where.join(' AND ')} ORDER BY created_at DESC`).all(...params);
}

router.get('/', (req, res) => {
  const formations = db.prepare('SELECT * FROM formations WHERE actif = 1 ORDER BY categorie, prix LIMIT 6').all();
  const temoignages = db.prepare('SELECT * FROM temoignages WHERE valide = 1 ORDER BY created_at DESC LIMIT 3').all();
  const stats = {
    users: db.prepare('SELECT COUNT(*) AS total FROM users WHERE actif = 1').get().total,
    formations: db.prepare('SELECT COUNT(*) AS total FROM formations WHERE actif = 1').get().total,
    inscriptions: db.prepare('SELECT COUNT(*) AS total FROM inscriptions').get().total,
    satisfaction: '4,9/5'
  };
  res.render('index', { title: 'Formation OPCVM Tunisie', formations, temoignages, stats });
});

router.post('/contact', (req, res) => {
  const { nom, email, sujet, message } = req.body;
  if (!nom || !email || !sujet || !message) {
    req.session.error = 'Merci de compléter le formulaire de contact.';
    return res.redirect('/#contact');
  }
  db.prepare('INSERT INTO contacts (nom, email, sujet, message) VALUES (?, ?, ?, ?)').run(nom.trim(), email.trim(), sujet.trim(), message.trim());
  req.session.success = 'Message envoyé. Notre équipe vous répondra rapidement.';
  res.redirect('/#contact');
});

router.get('/formations', (req, res) => {
  const { categorie, type } = req.query;
  const safeCategorie = ['investisseur', 'etudiant'].includes(categorie) ? categorie : '';
  const safeType = ['enligne', 'presentiel'].includes(type) ? type : '';
  res.render('formations/index', {
    title: 'Formations',
    formations: formationsQuery({ categorie: safeCategorie, type: safeType }),
    filters: { categorie: safeCategorie, type: safeType }
  });
});

router.get('/formations/:id', (req, res, next) => {
  const formation = db.prepare('SELECT * FROM formations WHERE id = ? AND actif = 1').get(req.params.id);
  if (!formation) return next();
  const modules = db.prepare('SELECT * FROM modules WHERE formation_id = ? ORDER BY ordre').all(formation.id);
  const ressources = db.prepare('SELECT * FROM ressources WHERE formation_id = ? ORDER BY created_at DESC').all(formation.id);
  const sessions = db.prepare('SELECT * FROM sessions WHERE formation_id = ? ORDER BY date_debut').all(formation.id);
  const temoignages = db.prepare('SELECT * FROM temoignages WHERE formation_id = ? AND valide = 1 ORDER BY created_at DESC').all(formation.id);
  const enrolled = req.session.userId
    ? db.prepare('SELECT id FROM inscriptions WHERE user_id = ? AND formation_id = ?').get(req.session.userId, formation.id)
    : null;
  res.render('formations/detail', { title: formation.titre, formation, modules, ressources, sessions, temoignages, enrolled });
});

router.post('/formations/:id/enroll', requireAuth, (req, res) => {
  const formation = db.prepare('SELECT * FROM formations WHERE id = ? AND actif = 1').get(req.params.id);
  if (!formation) {
    req.session.error = 'Formation introuvable.';
    return res.redirect('/formations');
  }
  try {
    const paiement = formation.prix === 0 ? 'gratuit' : 'en_attente';
    db.prepare('INSERT INTO inscriptions (user_id, formation_id, statut, paiement, montant_paye) VALUES (?, ?, ?, ?, 0)')
      .run(req.session.userId, formation.id, 'en_attente', paiement);
    db.prepare('INSERT OR IGNORE INTO progressions (user_id, formation_id, progression) VALUES (?, ?, 0)').run(req.session.userId, formation.id);
    if (formation.places_dispo > 0) {
      db.prepare('UPDATE formations SET places_dispo = places_dispo - 1 WHERE id = ?').run(formation.id);
    }
    req.session.success = 'Inscription enregistrée.';
  } catch (error) {
    req.session.error = 'Vous êtes déjà inscrit à cette formation.';
  }
  res.redirect(`/formations/${formation.id}`);
});

router.get('/formation-investisseurs', (req, res) => {
  const formations = formationsQuery({ categorie: 'investisseur' });
  const temoignages = db.prepare("SELECT * FROM temoignages WHERE valide = 1 AND role LIKE '%Investisseur%' ORDER BY created_at DESC LIMIT 3").all();
  res.render('formations/investisseurs', { title: 'Parcours Investisseurs', formations, temoignages });
});

router.get('/formation-etudiants', (req, res) => {
  const formations = formationsQuery({ categorie: 'etudiant' });
  const temoignages = db.prepare("SELECT * FROM temoignages WHERE valide = 1 AND (role LIKE '%Étudiante%' OR role LIKE '%Étudiant%') ORDER BY created_at DESC LIMIT 3").all();
  res.render('formations/etudiants', { title: 'Parcours Étudiants', formations, temoignages });
});

router.get('/dashboard', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, nom, prenom, email, role FROM users WHERE id = ?').get(req.session.userId);
  const inscriptions = db.prepare(`
    SELECT i.*, f.titre, f.categorie, f.type, f.duree, f.prix, COALESCE(p.progression, 0) AS progression
    FROM inscriptions i
    JOIN formations f ON f.id = i.formation_id
    LEFT JOIN progressions p ON p.user_id = i.user_id AND p.formation_id = i.formation_id
    WHERE i.user_id = ?
    ORDER BY i.created_at DESC
  `).all(user.id);
  res.render('dashboard', { title: 'Tableau de bord', user, inscriptions });
});

module.exports = router;
