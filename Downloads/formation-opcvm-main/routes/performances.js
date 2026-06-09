const express = require('express');
const db = require('../database/db');

const router = express.Router();

function anonymize(user) {
  const initial = user.prenom ? `${user.prenom[0]}.` : 'M.';
  const last = user.nom ? `${user.nom[0]}***` : '***';
  return `${initial} ${last}`;
}

function leaderboard(type) {
  return db.prepare(`
    SELECT c.score, c.mois, u.id, u.nom, u.prenom, u.role,
           COALESCE(p.rendement_pct, 0) AS rendement_pct,
           COALESCE(p.nb_cours_finis, 0) AS nb_cours_finis,
           COALESCE(p.score_moyen, c.score) AS score_moyen
    FROM classement c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN performances_users p ON p.user_id = u.id
    WHERE c.type = ?
    GROUP BY c.id
    ORDER BY c.score DESC
    LIMIT 50
  `).all(type).map((row, index) => ({ ...row, rang: index + 1, nom_public: anonymize(row) }));
}

router.get('/performances/investisseurs', async (req, res) => {
  try {
    res.json(leaderboard('investisseur'));
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger le classement investisseurs.' });
  }
});

router.get('/performances/etudiants', async (req, res) => {
  try {
    res.json(leaderboard('etudiant'));
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger le classement étudiants.' });
  }
});

router.get('/performances/moi', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Connexion requise.' });
    const user = db.prepare('SELECT id, nom, prenom, role FROM users WHERE id = ?').get(req.session.userId);
    const stats = db.prepare('SELECT * FROM performances_users WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(req.session.userId);
    const rank = db.prepare('SELECT * FROM classement WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(req.session.userId);
    res.json({ user, stats, rank });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger vos statistiques.' });
  }
});

router.get('/performances/global', async (req, res) => {
  try {
    const row = db.prepare(`
      SELECT COALESCE(AVG(score), 0) AS moyenne, COALESCE(MAX(score), 0) AS meilleur, COUNT(DISTINCT user_id) AS participants
      FROM classement
    `).get();
    const rendement = db.prepare('SELECT COALESCE(AVG(rendement_pct), 0) AS moyenne FROM performances_users').get().moyenne;
    res.json({ moyenne_plateforme: row.moyenne, meilleur_score: row.meilleur, participants: row.participants, rendement_moyen: rendement });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger les statistiques globales.' });
  }
});

module.exports = router;
