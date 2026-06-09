const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'pdfs');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf' || path.extname(file.originalname).toLowerCase() !== '.pdf') {
      return cb(new Error('Seuls les fichiers PDF sont acceptés.'));
    }
    cb(null, true);
  }
});

function monthRows() {
  return db.prepare(`
    SELECT strftime('%Y-%m', created_at) AS mois, COUNT(*) AS total
    FROM inscriptions
    GROUP BY mois
    ORDER BY mois
    LIMIT 12
  `).all();
}

function redirectBack(req, res, fallback) {
  res.redirect(req.get('referer') || fallback);
}

router.get('/', (req, res) => {
  const stats = {
    users: db.prepare('SELECT COUNT(*) AS total FROM users').get().total,
    formations: db.prepare('SELECT COUNT(*) AS total FROM formations').get().total,
    inscriptions: db.prepare('SELECT COUNT(*) AS total FROM inscriptions').get().total,
    contacts: db.prepare('SELECT COUNT(*) AS total FROM contacts WHERE lu = 0').get().total,
    revenus: db.prepare('SELECT COALESCE(SUM(montant_paye), 0) AS total FROM inscriptions WHERE paiement = ?').get('paye').total,
    temoignages: db.prepare('SELECT COUNT(*) AS total FROM temoignages WHERE valide = 0').get().total,
    commentaires: db.prepare('SELECT COUNT(*) AS total FROM commentaires WHERE approuve = 0').get().total,
    intermediaires: db.prepare('SELECT COUNT(*) AS total FROM intermediaires').get().total,
    messages: db.prepare('SELECT COUNT(*) AS total FROM messages_membres WHERE lu = 0').get().total,
    societes: db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM societes_bourse) + (SELECT COUNT(*) FROM societes_etrangeres) AS total
    `).get().total
  };
  const recentUsers = db.prepare('SELECT id, nom, prenom, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 6').all();
  const recentInscriptions = db.prepare(`
    SELECT i.*, u.nom, u.prenom, f.titre
    FROM inscriptions i
    JOIN users u ON u.id = i.user_id
    JOIN formations f ON f.id = i.formation_id
    ORDER BY i.created_at DESC LIMIT 6
  `).all();
  const pendingComments = db.prepare(`
    SELECT c.*, u.nom, u.prenom, u.email
    FROM commentaires c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.approuve = 0
    ORDER BY c.created_at DESC
    LIMIT 10
  `).all();
  const chartData = JSON.stringify({
    labels: monthRows().map((r) => r.mois),
    values: monthRows().map((r) => r.total)
  });
  res.render('admin/dashboard', { title: 'Admin', stats, recentUsers, recentInscriptions, pendingComments, chartData });
});

router.get('/users', (req, res) => {
  const q = String(req.query.q || '').trim();
  const role = ['etudiant', 'investisseur', 'formateur', 'admin'].includes(req.query.role) ? req.query.role : '';
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const limit = 10;
  const where = [];
  const params = {};
  if (q) {
    where.push('(nom LIKE @q OR prenom LIKE @q OR email LIKE @q)');
    params.q = `%${q}%`;
  }
  if (role) {
    where.push('role = @role');
    params.role = role;
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS total FROM users ${clause}`).get(params).total;
  const users = db.prepare(`SELECT * FROM users ${clause} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset: (page - 1) * limit });
  res.render('admin/users', { title: 'Utilisateurs', users, filters: { q, role }, page, pages: Math.max(Math.ceil(total / limit), 1) });
});

router.post('/users', (req, res) => {
  const { nom, prenom, email, password, role } = req.body;
  try {
    db.prepare('INSERT INTO users (nom, prenom, email, password, role, actif) VALUES (?, ?, ?, ?, ?, 1)')
      .run(nom, prenom, String(email).trim().toLowerCase(), bcrypt.hashSync(password || 'ChangeMe@2024', 10), role);
    req.session.success = 'Utilisateur créé.';
  } catch (error) {
    req.session.error = 'Impossible de créer cet utilisateur.';
  }
  res.redirect('/admin/users');
});

router.put('/users/:id/toggle', (req, res) => {
  db.prepare('UPDATE users SET actif = CASE actif WHEN 1 THEN 0 ELSE 1 END WHERE id = ? AND role != ?').run(req.params.id, 'admin');
  req.session.success = 'Statut utilisateur mis à jour.';
  redirectBack(req, res, '/admin/users');
});

router.delete('/users/:id', (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ? AND role != ?').run(req.params.id, 'admin');
  req.session.success = 'Utilisateur supprimé.';
  redirectBack(req, res, '/admin/users');
});

router.get('/formations', (req, res) => {
  const formations = db.prepare(`
    SELECT f.*, COUNT(i.id) AS inscrits
    FROM formations f
    LEFT JOIN inscriptions i ON i.formation_id = f.id
    GROUP BY f.id
    ORDER BY f.created_at DESC
  `).all();
  res.render('admin/formations', { title: 'Formations', formations });
});

router.post('/formations', (req, res) => {
  const { titre, description, categorie, type, niveau, duree, prix, places_max, places_dispo } = req.body;
  db.prepare(`
    INSERT INTO formations (titre, description, categorie, type, niveau, duree, prix, places_max, places_dispo, actif)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(titre, description, categorie, type, niveau, duree, Number(prix || 0), Number(places_max || 0), Number(places_dispo || 0));
  req.session.success = 'Formation créée.';
  res.redirect('/admin/formations');
});

router.put('/formations/:id', (req, res) => {
  const { titre, description, categorie, type, niveau, duree, prix, places_max, places_dispo } = req.body;
  db.prepare(`
    UPDATE formations
    SET titre = ?, description = ?, categorie = ?, type = ?, niveau = ?, duree = ?, prix = ?, places_max = ?, places_dispo = ?
    WHERE id = ?
  `).run(titre, description, categorie, type, niveau, duree, Number(prix || 0), Number(places_max || 0), Number(places_dispo || 0), req.params.id);
  req.session.success = 'Formation mise à jour.';
  res.redirect('/admin/formations');
});

router.put('/formations/:id/toggle', (req, res) => {
  db.prepare('UPDATE formations SET actif = CASE actif WHEN 1 THEN 0 ELSE 1 END WHERE id = ?').run(req.params.id);
  req.session.success = 'Statut formation mis à jour.';
  redirectBack(req, res, '/admin/formations');
});

router.delete('/formations/:id', (req, res) => {
  db.prepare('DELETE FROM formations WHERE id = ?').run(req.params.id);
  req.session.success = 'Formation supprimée.';
  redirectBack(req, res, '/admin/formations');
});

router.get('/ressources', (req, res) => {
  const formations = db.prepare('SELECT id, titre FROM formations ORDER BY titre').all();
  const ressources = db.prepare(`
    SELECT r.*, f.titre AS formation
    FROM ressources r
    JOIN formations f ON f.id = r.formation_id
    ORDER BY r.created_at DESC
  `).all();
  res.render('admin/ressources', { title: 'Ressources', formations, ressources });
});

router.post('/ressources/video', (req, res) => {
  const { formation_id, titre, url } = req.body;
  db.prepare('INSERT INTO ressources (formation_id, titre, type, url) VALUES (?, ?, ?, ?)')
    .run(formation_id, titre, 'video', url);
  req.session.success = 'Vidéo ajoutée.';
  res.redirect('/admin/ressources');
});

router.post('/ressources/pdf', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      req.session.error = err.message;
      return res.redirect('/admin/ressources');
    }
    if (!req.file) {
      req.session.error = 'Sélectionnez un PDF.';
      return res.redirect('/admin/ressources');
    }
    db.prepare('INSERT INTO ressources (formation_id, titre, type, fichier, taille_ko) VALUES (?, ?, ?, ?, ?)')
      .run(req.body.formation_id, req.body.titre, 'pdf', req.file.filename, Math.round(req.file.size / 1024));
    req.session.success = 'PDF ajouté.';
    res.redirect('/admin/ressources');
  });
});

router.delete('/ressources/:id', (req, res) => {
  const resource = db.prepare('SELECT * FROM ressources WHERE id = ?').get(req.params.id);
  if (resource && resource.fichier) {
    const file = path.join(uploadDir, resource.fichier);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  db.prepare('DELETE FROM ressources WHERE id = ?').run(req.params.id);
  req.session.success = 'Ressource supprimée.';
  res.redirect('/admin/ressources');
});

router.get('/inscriptions', (req, res) => {
  const statut = ['en_attente', 'confirme', 'annule', 'termine'].includes(req.query.statut) ? req.query.statut : '';
  const params = statut ? [statut] : [];
  const where = statut ? 'WHERE i.statut = ?' : '';
  const inscriptions = db.prepare(`
    SELECT i.*, u.nom, u.prenom, u.email, f.titre
    FROM inscriptions i
    JOIN users u ON u.id = i.user_id
    JOIN formations f ON f.id = i.formation_id
    ${where}
    ORDER BY i.created_at DESC
  `).all(...params);
  res.render('admin/inscriptions', { title: 'Inscriptions', inscriptions, statut });
});

router.put('/inscriptions/:id', (req, res) => {
  const { statut, paiement, montant_paye } = req.body;
  db.prepare('UPDATE inscriptions SET statut = ?, paiement = ?, montant_paye = ? WHERE id = ?')
    .run(statut, paiement, Number(montant_paye || 0), req.params.id);
  req.session.success = 'Inscription mise à jour.';
  redirectBack(req, res, '/admin/inscriptions');
});

router.get('/contacts', (req, res) => {
  const contacts = db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all();
  db.prepare('UPDATE contacts SET lu = 1 WHERE lu = 0').run();
  res.render('admin/contacts', { title: 'Contacts', contacts });
});

router.delete('/contacts/:id', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  req.session.success = 'Message supprimé.';
  res.redirect('/admin/contacts');
});

router.get('/stats', (req, res) => {
  const months = monthRows();
  const roles = db.prepare('SELECT role, COUNT(*) AS total FROM users GROUP BY role ORDER BY role').all();
  const topFormations = db.prepare(`
    SELECT f.titre, COUNT(i.id) AS total
    FROM formations f
    LEFT JOIN inscriptions i ON i.formation_id = f.id
    GROUP BY f.id
    ORDER BY total DESC
    LIMIT 6
  `).all();
  res.render('admin/stats', {
    title: 'Statistiques',
    topFormations,
    barData: JSON.stringify({ labels: months.map((r) => r.mois), values: months.map((r) => r.total) }),
    pieData: JSON.stringify({ labels: roles.map((r) => r.role), values: roles.map((r) => r.total) })
  });
});

router.get('/temoignages', (req, res) => {
  const temoignages = db.prepare(`
    SELECT t.*, f.titre AS formation
    FROM temoignages t
    LEFT JOIN formations f ON f.id = t.formation_id
    ORDER BY t.created_at DESC
  `).all();
  res.render('admin/temoignages', { title: 'Témoignages', temoignages });
});

router.put('/temoignages/:id/toggle', (req, res) => {
  db.prepare('UPDATE temoignages SET valide = CASE valide WHEN 1 THEN 0 ELSE 1 END WHERE id = ?').run(req.params.id);
  req.session.success = 'Témoignage mis à jour.';
  redirectBack(req, res, '/admin/temoignages');
});

router.delete('/temoignages/:id', (req, res) => {
  db.prepare('DELETE FROM temoignages WHERE id = ?').run(req.params.id);
  req.session.success = 'Témoignage supprimé.';
  res.redirect('/admin/temoignages');
});

module.exports = router;
