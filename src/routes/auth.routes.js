const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { db } = require('../database');
const { redirectByRole } = require('../middlewares/auth');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.currentUser) return redirectByRole(req, res);
  return res.render('auth/login', {
    pageTitle: 'Entrar no painel'
  });
});

router.post(
  '/login',
  [
    body('email').trim().isEmail().withMessage('Informe um e-mail válido.'),
    body('senha').trim().isLength({ min: 6 }).withMessage('Informe a senha corretamente.')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        req.session.notice = { type: 'error', text: errors.array()[0].msg };
        return res.redirect('/login');
      }

      const { email, senha } = req.body;

      // Consulta adaptada para PostgreSQL usando db.query e parâmetros $1
      const result = await db.query('SELECT * FROM usuarios WHERE LOWER(email) = LOWER($1)', [email]);
      const user = result.rows[0];

      if (!user) {
        console.log('Usuário não encontrado para o e-mail:', email);
        req.session.notice = { type: 'error', text: 'Credenciais inválidas.' };
        return res.redirect('/login');
      }

      const senhaValida = bcrypt.compareSync(senha, user.senha || '');
      
      if (!senhaValida) {
        console.log('Senha incorreta para:', email);
        req.session.notice = { type: 'error', text: 'Credenciais inválidas.' };
        return res.redirect('/login');
      }

      req.session.userId = user.id;
      req.session.notice = { type: 'success', text: `Bem-vindo(a), ${user.nome}!` };
      return res.redirect('/painel');
    } catch (err) {
      console.error('Erro no login:', err);
      req.session.notice = { type: 'error', text: 'Erro no servidor.' };
      return res.redirect('/login');
    }
  }
);

module.exports = router;
