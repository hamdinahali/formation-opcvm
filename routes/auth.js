const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/db');

const router = express.Router();

router.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Connexion' });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password)) {
    req.session.error = 'Email ou mot de passe incorrect.';
    return res.redirect('/auth/login');
  }
  if (!user.actif) {
    req.session.error = 'Votre compte est désactivé.';
    return res.redirect('/auth/login');
  }
  req.session.userId = user.id;
  req.session.success = `Bienvenue ${user.prenom}.`;
  return res.redirect(user.role === 'admin' ? '/admin' : '/dashboard');
});

router.get('/register', (req, res) => {
  res.render('auth/register', { title: 'Créer un compte' });
});

router.post('/register', (req, res) => {
  const { nom, prenom, email, password, role } = req.body;
  const cleanRole = ['etudiant', 'investisseur'].includes(role) ? role : 'etudiant';
  if (!nom || !prenom || !email || !password) {
    req.session.error = 'Tous les champs sont requis.';
    return res.redirect('/auth/register');
  }
  try {
    const result = db.prepare(`
      INSERT INTO users (nom, prenom, email, password, role, actif)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(nom.trim(), prenom.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10), cleanRole);
    req.session.userId = result.lastInsertRowid;
    req.session.success = 'Compte créé avec succès.';
    return res.redirect('/dashboard');
  } catch (error) {
    req.session.error = 'Un compte existe déjà avec cet email.';
    return res.redirect('/auth/register');
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
