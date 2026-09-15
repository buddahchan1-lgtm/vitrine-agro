const { db } = require('../database');

function attachSessionUser(req, res, next) {
  const userId = req.session.userId || (req.session.usuario ? req.session.usuario.id : null);

  if (!userId) {
    return next();
  }

 const query = `
    SELECT id, nome, email, foto, comunidade, tipo_acesso, status, whatsapp
    FROM usuarios
    WHERE id = ?
  `;

  db.get(query, [userId], (err, user) => {
    if (err) return next(err);

    if (user) {
      req.currentUser = user;
    } else {
      req.session.destroy(() => {});
    }
    next();
  });
}

function attachViewData(req, res, next) {
  res.locals.currentUser = req.currentUser || null;
  res.locals.notice = req.session.notice || null;
  delete req.session.notice;

  if (!req.currentUser) {
    res.locals.unreadCount = 0;
    return next();
  }

  const queryUnread = `
    SELECT COUNT(*) AS total
    FROM mensagens m
    WHERE m.criado_em > COALESCE(
      (SELECT ultima_leitura_em FROM leituras_mural WHERE usuario_id = ?),
      '1970-01-01 00:00:00'
    )
  `;

  db.get(queryUnread, [req.currentUser.id], (err, row) => {
    res.locals.unreadCount = (row && row.total) ? row.total : 0;
    next();
  });
}

function requireAuth(req, res, next) {
  if (!req.currentUser) {
    req.session.notice = { type: 'error', text: 'Faça login para acessar o painel.' };
    return res.redirect('/login');
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.currentUser || req.currentUser.tipo_acesso !== 'admin') {
    req.session.notice = { type: 'error', text: 'Acesso restrito à gestora.' };
    return res.redirect('/painel');
  }
  return next();
}

function redirectByRole(req, res) {
  if (!req.currentUser) return res.redirect('/login');
  return res.redirect('/painel');
}

module.exports = {
  attachSessionUser,
  attachViewData,
  requireAuth,
  requireAdmin,
  redirectByRole
};
