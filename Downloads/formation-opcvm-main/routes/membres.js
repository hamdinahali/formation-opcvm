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

router.get('/membres/messages/inbox', requireApiAuth, async (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT m.*, u.nom AS expediteur_nom, u.prenom AS expediteur_prenom
      FROM messages_membres m
      JOIN users u ON u.id = m.expediteur
      WHERE m.destinataire = ?
      ORDER BY m.created_at DESC
    `).all(req.user.id);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger la messagerie.' });
  }
});

router.put('/membres/messages/:id/lu', requireApiAuth, async (req, res) => {
  try {
    db.prepare('UPDATE messages_membres SET lu = 1 WHERE id = ? AND destinataire = ?').run(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Mise à jour impossible.' });
  }
});

router.get('/membres', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const params = {};
    const where = ['p.visible = 1', "u.role IN ('etudiant','investisseur','formateur')"];
    if (q) {
      where.push('(u.nom LIKE @q OR u.prenom LIKE @q OR p.ville LIKE @q OR p.specialite LIKE @q)');
      params.q = `%${q}%`;
    }
    const rows = db.prepare(`
      SELECT p.*, u.nom, u.prenom, u.email, u.role
      FROM profils_publics p
      JOIN users u ON u.id = p.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY u.prenom, u.nom
    `).all(params);
    res.json({ members: rows, currentUser: currentUser(req) });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger les membres.' });
  }
});

router.get('/membres/:id', async (req, res) => {
  try {
    const item = db.prepare(`
      SELECT p.*, u.nom, u.prenom, u.email, u.role
      FROM profils_publics p
      JOIN users u ON u.id = p.user_id
      WHERE p.user_id = ? AND p.visible = 1
    `).get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Profil introuvable.' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger le profil.' });
  }
});

router.post('/membres/profil', requireApiAuth, async (req, res) => {
  try {
    const { bio, linkedin, specialite, experience, ville, visible } = req.body;
    db.prepare(`
      INSERT INTO profils_publics (user_id, bio, linkedin, specialite, experience, ville, visible)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        bio = excluded.bio,
        linkedin = excluded.linkedin,
        specialite = excluded.specialite,
        experience = excluded.experience,
        ville = excluded.ville,
        visible = excluded.visible
    `).run(req.user.id, bio || '', linkedin || '', specialite || '', experience || '', ville || '', visible === false || visible === '0' ? 0 : 1);
    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Profil impossible à enregistrer.' });
  }
});

router.post('/membres/:id/message', requireApiAuth, async (req, res) => {
  try {
    const { sujet, contenu } = req.body;
    if (!sujet || !contenu) return res.status(400).json({ error: 'Sujet et message requis.' });
    const info = db.prepare('INSERT INTO messages_membres (expediteur, destinataire, sujet, contenu) VALUES (?, ?, ?, ?)')
      .run(req.user.id, req.params.id, sujet, contenu);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: 'Message impossible à envoyer.' });
  }
});

module.exports = router;
