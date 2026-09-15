const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const morgan = require('morgan');

console.log('1. Iniciando servidor...');

const app = express();
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    console.log('2. Inicializando banco de dados...');
    const { initDatabase } = require('./src/database');
    await initDatabase();
    console.log('3. Banco de dados pronto!');
  } catch (err) {
    console.error('ERRO NO BANCO DE DADOS:', err);
    process.exit(1);
  }

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(morgan('dev'));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET || 'vitrine-agro-secret-dev',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 8 }
  }));

  app.use('/public', express.static(path.join(__dirname, 'public')));

  console.log('4. Carregando rotas...');
  const { attachSessionUser, attachViewData } = require('./src/middlewares/auth');
  const publicRoutes = require('./src/routes/public.routes');
  const authRoutes = require('./src/routes/auth.routes');
  const panelRoutes = require('./src/routes/panel.routes');

  app.use(attachSessionUser);
  app.use(attachViewData);
  app.use('/', publicRoutes);
  app.use('/', authRoutes);
  app.use('/', panelRoutes);
  console.log('5. Rotas carregadas com sucesso!');

  app.use((req, res) => {
    res.status(404).render('error', {
      pageTitle: 'Página não encontrada',
      message: 'A página solicitada não foi encontrada.',
      errorDetail: 'Verifique o endereço informado ou volte para a vitrine.'
    });
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).render('error', {
      pageTitle: 'Erro interno',
      message: 'Ocorreu um erro ao processar sua solicitação.',
      errorDetail: process.env.NODE_ENV === 'production' ? 'Tente novamente em instantes.' : err.message
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=================================`);
    console.log(`Vitrine Agro rodando em http://localhost:${PORT}`);
    console.log(`=================================\n`);
  });
}

start();

