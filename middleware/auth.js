const db = require('../database/db');

function setLocals(req, res, next) {
  res.locals.currentUser = null;
  if (req.session.userId) {
    res.locals.currentUser = db.prepare('SELECT id, nom, prenom, email, role, actif FROM users WHERE id = ?').get(req.session.userId);
  }
  res.locals.success = req.session.success;
  res.locals.error = req.session.error;
  delete req.session.success;
  delete req.session.error;
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    req.session.error = 'Veuillez vous connecter pour continuer.';
    return res.redirect('/auth/login');
  }
  const user = db.prepare('SELECT id, role, actif FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.actif) {
    req.session.destroy(() => {});
    return res.redirect('/auth/login');
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      req.session.error = 'Accès administrateur requis.';
      return res.redirect('/dashboard');
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin, setLocals };
