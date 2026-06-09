const express = require('express');
const db = require('../database/db');

const router = express.Router();

function requireApiAdmin(req, res, next) {
  const user = req.session.userId ? db.prepare('SELECT id, role, actif FROM users WHERE id = ?').get(req.session.userId) : null;
  if (!user || !user.actif) return res.status(401).json({ error: 'Connexion requise.' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Accès administrateur requis.' });
  req.user = user;
  next();
}

router.get('/societes', async (req, res) => {
  try {
    const { annee, trimestre } = req.query;
    const params = {};
    let perfFilter = '';
    if (annee) {
      perfFilter += ' AND annee = @annee';
      params.annee = Number(annee);
    }
    if (trimestre) {
      perfFilter += ' AND trimestre = @trimestre';
      params.trimestre = Number(trimestre);
    }
    const rows = db.prepare(`
      SELECT s.*, p.annee, p.trimestre, p.rendement_pct, p.volume_echange, p.nombre_clients, p.actif_gere, p.note_globale
      FROM societes_bourse s
      LEFT JOIN performances_societes p ON p.id = (
        SELECT id FROM performances_societes
        WHERE societe_id = s.id ${perfFilter}
        ORDER BY annee DESC, trimestre DESC, created_at DESC LIMIT 1
      )
      ORDER BY COALESCE(p.rendement_pct, -999) DESC, s.nom
    `).all(params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger les sociétés.' });
  }
});

router.get('/societes/:id', async (req, res) => {
  try {
    const societe = db.prepare('SELECT * FROM societes_bourse WHERE id = ?').get(req.params.id);
    if (!societe) return res.status(404).json({ error: 'Société introuvable.' });
    societe.performances = db.prepare('SELECT * FROM performances_societes WHERE societe_id = ? ORDER BY annee DESC, trimestre DESC').all(req.params.id);
    res.json(societe);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger la société.' });
  }
});

router.get('/societes/:id/perf', async (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM performances_societes WHERE societe_id = ? ORDER BY annee DESC, trimestre DESC').all(req.params.id);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger les performances.' });
  }
});

router.post('/societes', requireApiAdmin, async (req, res) => {
  try {
    const { nom, sigle, logo_url, site_web, description } = req.body;
    if (!nom) return res.status(400).json({ error: 'Nom requis.' });
    const info = db.prepare('INSERT INTO societes_bourse (nom, sigle, logo_url, site_web, description) VALUES (?, ?, ?, ?, ?)')
      .run(nom, sigle || '', logo_url || '', site_web || '', description || '');
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: 'Création impossible.' });
  }
});

router.post('/societes/:id/perf', requireApiAdmin, async (req, res) => {
  try {
    const { annee, trimestre, rendement_pct, volume_echange, nombre_clients, actif_gere, note_globale } = req.body;
    const exists = db.prepare('SELECT id FROM societes_bourse WHERE id = ?').get(req.params.id);
    if (!exists) return res.status(404).json({ error: 'Société introuvable.' });
    const info = db.prepare(`
      INSERT INTO performances_societes (societe_id, annee, trimestre, rendement_pct, volume_echange, nombre_clients, actif_gere, note_globale)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.id, Number(annee), Number(trimestre), Number(rendement_pct || 0), Number(volume_echange || 0), Number(nombre_clients || 0), Number(actif_gere || 0), Number(note_globale || 0));
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: 'Ajout de performance impossible.' });
  }
});

module.exports = router;
