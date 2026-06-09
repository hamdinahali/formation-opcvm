const express = require('express');
const db = require('../database/db');

const router = express.Router();

function currentUser(req) {
  return req.session.userId ? db.prepare('SELECT id, role, actif FROM users WHERE id = ?').get(req.session.userId) : null;
}

function requireApiAuth(req, res, next) {
  const user = currentUser(req);
  if (!user || !user.actif) return res.status(401).json({ error: 'Connexion requise.' });
  req.user = user;
  next();
}

function requireApiAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user || !user.actif) return res.status(401).json({ error: 'Connexion requise.' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Accès administrateur requis.' });
  req.user = user;
  next();
}

router.get('/intermediaires', async (req, res) => {
  try {
    const where = [];
    const params = {};
    if (['courtier', 'gestionnaire', 'conseiller', 'banque'].includes(req.query.type)) {
      where.push('i.type = @type');
      params.type = req.query.type;
    }
    if (req.query.ville) {
      where.push('i.ville = @ville');
      params.ville = req.query.ville;
    }
    if (req.query.note) {
      where.push('i.note_moyenne >= @note');
      params.note = Number(req.query.note);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`
      SELECT i.*, COUNT(a.id) AS avis_count, COALESCE(AVG(a.note), i.note_moyenne) AS note_calculee
      FROM intermediaires i
      LEFT JOIN avis_intermediaires a ON a.intermediaire_id = i.id
      ${clause}
      GROUP BY i.id
      ORDER BY note_calculee DESC, i.nom
    `).all(params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger les intermédiaires.' });
  }
});

router.get('/intermediaires/:id', async (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM intermediaires WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Intermédiaire introuvable.' });
    item.avis = db.prepare(`
      SELECT a.*, u.nom, u.prenom
      FROM avis_intermediaires a
      JOIN users u ON u.id = a.user_id
      WHERE a.intermediaire_id = ?
      ORDER BY a.created_at DESC
    `).all(req.params.id);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger le détail.' });
  }
});

router.post('/intermediaires', requireApiAdmin, async (req, res) => {
  try {
    const { nom, type, ville, telephone, email, site_web, description } = req.body;
    if (!nom || !type) return res.status(400).json({ error: 'Nom et type requis.' });
    const info = db.prepare(`
      INSERT INTO intermediaires (nom, type, ville, telephone, email, site_web, description, agree_amf)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(nom, type, ville || '', telephone || '', email || '', site_web || '', description || '');
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: 'Création impossible.' });
  }
});

router.post('/intermediaires/:id/avis', requireApiAuth, async (req, res) => {
  try {
    const { note, commentaire } = req.body;
    const safeNote = Math.min(Math.max(Number(note), 1), 5);
    db.prepare(`
      INSERT INTO avis_intermediaires (intermediaire_id, user_id, note, commentaire)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, intermediaire_id) DO UPDATE SET note = excluded.note, commentaire = excluded.commentaire, created_at = CURRENT_TIMESTAMP
    `).run(req.params.id, req.user.id, safeNote, commentaire || '');
    const avg = db.prepare('SELECT AVG(note) AS value FROM avis_intermediaires WHERE intermediaire_id = ?').get(req.params.id).value || 0;
    db.prepare('UPDATE intermediaires SET note_moyenne = ? WHERE id = ?').run(avg, req.params.id);
    res.status(201).json({ ok: true, note_moyenne: avg });
  } catch (error) {
    res.status(500).json({ error: 'Avis impossible à enregistrer.' });
  }
});

module.exports = router;
