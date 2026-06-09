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

function commentSelect(where = 'c.approuve = 1') {
  return `
    SELECT c.*, u.nom, u.prenom,
      SUM(CASE WHEN r.type = 'like' THEN 1 ELSE 0 END) AS likes,
      SUM(CASE WHEN r.type = 'dislike' THEN 1 ELSE 0 END) AS dislikes
    FROM commentaires c
    LEFT JOIN users u ON u.id = c.user_id
    LEFT JOIN reactions r ON r.commentaire_id = c.id
    WHERE ${where}
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `;
}

router.get('/commentaires', async (req, res) => {
  try {
    const user = currentUser(req);
    const approved = db.prepare(commentSelect(req.query.type ? 'c.approuve = 1 AND c.type_cible = @type' : 'c.approuve = 1'))
      .all(req.query.type ? { type: req.query.type } : {});
    const pending = user && user.role === 'admin' ? db.prepare(commentSelect('c.approuve = 0')).all() : [];
    res.json({ comments: approved, pending, currentUser: user ? { id: user.id, role: user.role } : null });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger les commentaires.' });
  }
});

router.get('/commentaires/:type/:id', async (req, res) => {
  try {
    const rows = db.prepare(commentSelect('c.approuve = 1 AND c.type_cible = @type AND c.cible_id = @id'))
      .all({ type: req.params.type, id: req.params.id });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger les commentaires ciblés.' });
  }
});

router.post('/commentaires', requireApiAuth, async (req, res) => {
  try {
    const { type_cible, cible_id, contenu, note } = req.body;
    if (!contenu) return res.status(400).json({ error: 'Commentaire requis.' });
    const info = db.prepare('INSERT INTO commentaires (user_id, type_cible, cible_id, contenu, note, approuve) VALUES (?, ?, ?, ?, ?, 0)')
      .run(req.user.id, type_cible || 'general', cible_id || null, contenu, note || null);
    res.status(201).json({ id: info.lastInsertRowid, message: 'Votre commentaire est en attente de modération.' });
  } catch (error) {
    res.status(500).json({ error: 'Enregistrement impossible.' });
  }
});

router.post('/commentaires/:id/react', requireApiAuth, async (req, res) => {
  try {
    const type = req.body.type === 'dislike' ? 'dislike' : 'like';
    db.prepare(`
      INSERT INTO reactions (commentaire_id, user_id, type)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, commentaire_id) DO UPDATE SET type = excluded.type, created_at = CURRENT_TIMESTAMP
    `).run(req.params.id, req.user.id, type);
    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Réaction impossible.' });
  }
});

router.delete('/commentaires/:id', requireApiAdmin, async (req, res) => {
  try {
    db.prepare('DELETE FROM commentaires WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Suppression impossible.' });
  }
});

router.put('/commentaires/:id/approve', requireApiAdmin, async (req, res) => {
  try {
    db.prepare('UPDATE commentaires SET approuve = 1 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Validation impossible.' });
  }
});

module.exports = router;
