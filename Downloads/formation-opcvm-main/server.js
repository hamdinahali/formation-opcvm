const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const methodOverride = require('method-override');

const db = require('./database/db');

const { setLocals } = require('./middleware/auth');
const mainRoutes = require('./routes/main');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const societesRoutes = require('./routes/societes');
const intermediairesRoutes = require('./routes/intermediaires');
const performancesRoutes = require('./routes/performances');
const etrangeresRoutes = require('./routes/etrangeres');
const commentairesRoutes = require('./routes/commentaires');
const membresRoutes = require('./routes/membres');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'database') }),
  secret: process.env.SESSION_SECRET || 'formation-opcvm-session-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use(setLocals);

if (typeof db.initDB === 'function') db.initDB();

[
  'societes-bourse',
  'intermediaires',
  'performances',
  'societes-etrangeres',
  'commentaires',
  'membres'
].forEach((page) => {
  app.get(`/${page}.html`, (req, res) => res.sendFile(path.join(__dirname, 'public', `${page}.html`)));
});

app.use('/api', societesRoutes);
app.use('/api', intermediairesRoutes);
app.use('/api', performancesRoutes);
app.use('/api', etrangeresRoutes);
app.use('/api', commentairesRoutes);
app.use('/api', membresRoutes);

app.use('/', mainRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'Page introuvable' });
});

app.use((err, req, res, next) => {
  console.error(err);
  req.session.error = err.message || 'Une erreur est survenue.';
  res.status(err.status || 500).render('errors/500', { title: 'Erreur serveur', error: err });
});

app.listen(PORT, () => {
  console.log(`Formation OPCVM lancé sur http://localhost:${PORT}`);
});
