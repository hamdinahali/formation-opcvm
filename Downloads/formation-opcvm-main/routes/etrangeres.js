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

router.get('/etrangeres', async (req, res) => {
  try {
    const where = [];
    const params = {};
    if (req.query.pays) {
      where.push('s.pays = @pays');
      params.pays = req.query.pays;
    }
    if (req.query.secteur) {
      where.push('s.secteur = @secteur');
      params.secteur = req.query.secteur;
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`
      SELECT s.*, p.annee, p.trimestre, p.rendement_pct, p.valeur_action, p.devise, p.variation_pct
      FROM societes_etrangeres s
      LEFT JOIN performances_etrangeres p ON p.id = (
        SELECT id FROM performances_etrangeres WHERE societe_id = s.id ORDER BY annee DESC, trimestre DESC, created_at DESC LIMIT 1
      )
      ${clause}
      ORDER BY s.pays, COALESCE(p.rendement_pct, -999) DESC
    `).all(params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger les sociétés étrangères.' });
  }
});

router.get('/etrangeres/:id', async (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM societes_etrangeres WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Société introuvable.' });
    item.performances = db.prepare('SELECT * FROM performances_etrangeres WHERE societe_id = ? ORDER BY annee DESC, trimestre DESC').all(req.params.id);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger le détail.' });
  }
});

router.post('/etrangeres', requireApiAdmin, async (req, res) => {
  try {
    const { nom, pays, indice, secteur, ticker, description } = req.body;
    if (!nom || !pays) return res.status(400).json({ error: 'Nom et pays requis.' });
    const info = db.prepare('INSERT INTO societes_etrangeres (nom, pays, indice, secteur, ticker, description) VALUES (?, ?, ?, ?, ?, ?)')
      .run(nom, pays, indice || '', secteur || '', ticker || '', description || '');
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: 'Création impossible.' });
  }
});

router.post('/etrangeres/:id/perf', requireApiAdmin, async (req, res) => {
  try {
    const { annee, trimestre, rendement_pct, valeur_action, devise, variation_pct } = req.body;
    const info = db.prepare(`
      INSERT INTO performances_etrangeres (societe_id, annee, trimestre, rendement_pct, valeur_action, devise, variation_pct)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.id, Number(annee), Number(trimestre), Number(rendement_pct || 0), Number(valeur_action || 0), devise || 'USD', Number(variation_pct || 0));
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: 'Ajout de performance impossible.' });
  }
});

module.exports = router;
