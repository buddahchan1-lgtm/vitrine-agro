const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const dataFolder = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataFolder)) {
  fs.mkdirSync(dataFolder, { recursive: true });
}

const dbPath = path.join(dataFolder, 'vitrine-agro.db');

const db = new sqlite3.Database(dbPath);
db.run('PRAGMA foreign_keys = ON');

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err); else resolve(this);
    });
  });
}

// Roda um ALTER TABLE e ignora erro de "coluna ja existe" (necessario porque
// SQLite nao suporta "ADD COLUMN IF NOT EXISTS"). Isso permite migrar bancos
// que ja existiam antes destas colunas serem criadas, sem quebrar nada.
function addColumnIfMissing(table, column, definition) {
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (err) => {
    if (err && !/duplicate column name/i.test(err.message)) {
      console.error(`Erro ao migrar coluna ${column} em ${table}:`, err.message);
    }
  });
}

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err); else resolve(this);
    });
  });
}

async function addColumnIfMissingAsync(table, column, definition) {
  try {
    await runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    if (!/duplicate column name/i.test(err.message)) {
      console.error(`Erro ao migrar coluna ${column} em ${table}:`, err.message);
    }
  }
}

async function initDatabase() {
  await runAsync(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha TEXT NOT NULL,
      foto TEXT,
      comunidade TEXT NOT NULL,
      tipo_acesso TEXT NOT NULL CHECK(tipo_acesso IN ('admin', 'produtor')),
      status TEXT NOT NULL DEFAULT 'ativo' CHECK(status IN ('ativo', 'invisivel'))
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produtor_id INTEGER NOT NULL,
      data_feira TEXT NOT NULL,
      quantidade INTEGER NOT NULL,
      valor_unitario REAL NOT NULL,
      excluido_em TEXT,
      pago_em TEXT,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(produtor_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produtor_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      categoria TEXT NOT NULL,
      quantidade TEXT,
      FOREIGN KEY(produtor_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);

    await runAsync(`
    CREATE TABLE IF NOT EXISTS produtos_baixas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      data_feira TEXT NOT NULL,
      quantidade_sobra REAL NOT NULL,
      quantidade_vendida REAL,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT,
      UNIQUE(produto_id, data_feira),
      FOREIGN KEY(produto_id) REFERENCES produtos(id) ON DELETE CASCADE
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS comentarios_produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      nome_visitante TEXT NOT NULL,
      texto TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(produto_id) REFERENCES produtos(id) ON DELETE CASCADE
    )
  `);

  await runAsync(`
  CREATE TABLE IF NOT EXISTS comentario_curtidas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comentario_id INTEGER NOT NULL,
    google_id TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comentario_id, google_id),
    FOREIGN KEY(comentario_id) REFERENCES comentarios_produtos(id) ON DELETE CASCADE
  )
`);

  await runAsync(`
  CREATE TABLE IF NOT EXISTS produto_interesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    google_id TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(produto_id, google_id),
    FOREIGN KEY(produto_id) REFERENCES produtos(id) ON DELETE CASCADE
  )
`);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS mensagens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remetente_id INTEGER NOT NULL,
      texto TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(remetente_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS conversas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS conversa_participantes (
      conversa_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      PRIMARY KEY (conversa_id, usuario_id),
      FOREIGN KEY(conversa_id) REFERENCES conversas(id) ON DELETE CASCADE,
      FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS conversa_mensagens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversa_id INTEGER NOT NULL,
      remetente_id INTEGER NOT NULL,
      texto TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(conversa_id) REFERENCES conversas(id) ON DELETE CASCADE,
      FOREIGN KEY(remetente_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS conversa_leituras (
      conversa_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      ultima_leitura_em TEXT NOT NULL DEFAULT '1970-01-01 00:00:00',
      PRIMARY KEY (conversa_id, usuario_id),
      FOREIGN KEY(conversa_id) REFERENCES conversas(id) ON DELETE CASCADE,
      FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS leituras_mural (
      usuario_id INTEGER PRIMARY KEY,
      ultima_leitura_em TEXT NOT NULL DEFAULT '1970-01-01 00:00:00',
      FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);

   await runAsync(`
    CREATE TABLE IF NOT EXISTS leituras_notificacoes_produtos (
      usuario_id INTEGER PRIMARY KEY,
      ultima_leitura_em TEXT NOT NULL DEFAULT '1970-01-01 00:00:00',
      FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS avisos_notificacao_vistos (
      usuario_id INTEGER NOT NULL,
      mensagem_id INTEGER NOT NULL,
      PRIMARY KEY (usuario_id, mensagem_id),
      FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
      FOREIGN KEY(mensagem_id) REFERENCES mensagens(id) ON DELETE CASCADE
    )
  `);

  // Migrações (rodam em sequência e só terminam depois que TODAS concluírem)
  await addColumnIfMissingAsync('comentarios_produtos', 'avatar_url', 'TEXT');
  await addColumnIfMissingAsync('comentarios_produtos', 'autor_google_id', 'TEXT');
  await addColumnIfMissingAsync('mensagens', 'editado_em', 'TEXT');
  await addColumnIfMissingAsync('conversa_mensagens', 'editado_em', 'TEXT');
  await addColumnIfMissingAsync('conversas', 'foto', 'TEXT');
  await addColumnIfMissingAsync('conversa_participantes', 'arquivada', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissingAsync('conversa_participantes', 'fixada', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissingAsync('produtos', 'criado_em', "TEXT");
  await addColumnIfMissingAsync('produtos', 'quantidade_valor', 'REAL');
  await addColumnIfMissingAsync('produtos', 'unidade', 'TEXT');
  await addColumnIfMissingAsync('produtos', 'quantidade_sobra', 'REAL');
  await addColumnIfMissingAsync('produtos', 'baixa_em', 'TEXT');
  await addColumnIfMissingAsync('produtos', 'imagem', 'TEXT');
  await addColumnIfMissingAsync('produtos', 'imagem', 'TEXT');
  await addColumnIfMissingAsync('usuarios', 'whatsapp', 'TEXT');
  await runAsync("UPDATE produtos SET criado_em = CURRENT_TIMESTAMP WHERE criado_em IS NULL");
  await runAsync("UPDATE usuarios SET foto = NULL");
  await runAsync("DELETE FROM tickets WHERE produtor_id NOT IN (SELECT id FROM usuarios)");

  const row = await dbGet('SELECT COUNT(*) AS total FROM usuarios');
  if (row.total === 0) {
    const senhaAdmin = bcrypt.hashSync('admin123', 10);
    const senhaProdutor = bcrypt.hashSync('produtor123', 10);

    const usuariosSeed = [
      ['Marina da Feira', 'admin@vitrineagro.local', senhaAdmin, null, 'Coordenação Central', 'admin', 'ativo'],
      ['José Bento', 'jose@vitrineagro.local', senhaProdutor, null, 'Comunidade Boa Vista', 'produtor', 'ativo'],
      ['Ana das Frutas', 'ana@vitrineagro.local', senhaProdutor, null, 'Sítio São Pedro', 'produtor', 'ativo'],
      ['Cooperativa Serra Verde', 'serra@vitrineagro.local', senhaProdutor, null, 'Assentamento Horizonte', 'produtor', 'invisivel']
    ];
    for (const u of usuariosSeed) {
      await runAsync(`INSERT INTO usuarios (nome, email, senha, foto, comunidade, tipo_acesso, status) VALUES (?, ?, ?, ?, ?, ?, ?)`, u);
    }

    const produtosSeed = [
      [2, 'Alface Crespa', 'Verduras'], [2, 'Queijo Frescal', 'Derivados'], [2, 'Cebolinha', 'Verduras'],
      [3, 'Banana Prata', 'Frutas'], [3, 'Mamão Formosa', 'Frutas'], [3, 'Doce de Goiaba', 'Derivados'],
      [4, 'Abóbora Cabotiá', 'Verduras']
    ];
    for (const p of produtosSeed) {
      await runAsync('INSERT INTO produtos (produtor_id, nome, categoria) VALUES (?, ?, ?)', p);
    }

    const mensagensSeed = [
      [1, 'Bem-vindos ao painel da feira! Usem este mural para avisos e alinhamentos.', '2026-08-10 09:00:00'],
      [2, 'Confirmo presença na feira de sábado e levarei verduras extras.', '2026-08-11 14:30:00'],
      [1, 'Reunião rápida sexta-feira às 17h para revisar logística de montagem.', '2026-08-12 08:15:00']
    ];
    for (const m of mensagensSeed) {
      await runAsync('INSERT INTO mensagens (remetente_id, texto, criado_em) VALUES (?, ?, ?)', m);
    }

    for (const id of [1, 2, 3, 4]) {
      await runAsync(`INSERT INTO leituras_mural (usuario_id, ultima_leitura_em) VALUES (?, '1970-01-01 00:00:00')`, [id]);
    }
  }
}

// ---------------------------------------------------------------------
// MURAL (avisos gerais)
// ---------------------------------------------------------------------

async function getMensagensMural(limite = 30) {
  return dbAll(`
    SELECT m.id, m.texto, m.criado_em, m.editado_em, m.remetente_id,
           u.nome AS remetente_nome, u.tipo_acesso, u.foto
    FROM mensagens m
    JOIN usuarios u ON u.id = m.remetente_id
    ORDER BY datetime(m.criado_em) DESC
    LIMIT ?
  `, [limite]);
}

async function editarMensagemMural(id, texto) {
  const resultado = await dbRun(
    'UPDATE mensagens SET texto = ?, editado_em = CURRENT_TIMESTAMP WHERE id = ?',
    [texto, id]
  );
  return resultado.changes > 0;
}

async function excluirMensagemMural(id) {
  const resultado = await dbRun('DELETE FROM mensagens WHERE id = ?', [id]);
  return resultado.changes > 0;
}

// Avisos do mural que o usuário ainda não viu (para notificar os produtores).
// Cada aviso só some da lista depois que o próprio usuário clica NELE —
// não quando ele só abre o sino, e não quando clica em outro aviso qualquer.
async function getMuralNotificacoes(usuarioId) {
  return dbAll(`
    SELECT m.id, m.texto, m.criado_em, u.nome AS remetente_nome
    FROM mensagens m
    JOIN usuarios u ON u.id = m.remetente_id
    WHERE m.id NOT IN (
      SELECT mensagem_id FROM avisos_notificacao_vistos WHERE usuario_id = ?
    )
    ORDER BY datetime(m.criado_em) DESC
    LIMIT 30
  `, [usuarioId]);
}

async function marcarMuralNotificacaoVista(usuarioId, mensagemId) {
  await dbRun(
    'INSERT OR IGNORE INTO avisos_notificacao_vistos (usuario_id, mensagem_id) VALUES (?, ?)',
    [usuarioId, mensagemId]
  );
}

// ---------------------------------------------------------------------
// NOTIFICAÇÕES DE NOVOS PRODUTOS (só interessa à gestora/admin)
// ---------------------------------------------------------------------

async function getProdutosNotificacoes(usuarioId) {
  const leitura = await dbGet('SELECT ultima_leitura_em FROM leituras_notificacoes_produtos WHERE usuario_id = ?', [usuarioId]);
  const ultimaLeituraEm = leitura ? leitura.ultima_leitura_em : '1970-01-01 00:00:00';
  return dbAll(`
    SELECT p.id, p.nome AS produto_nome, p.produtor_id, p.criado_em,
           u.nome AS produtor_nome, u.foto AS produtor_foto
    FROM produtos p
    JOIN usuarios u ON u.id = p.produtor_id
    WHERE p.criado_em IS NOT NULL AND datetime(p.criado_em) > datetime(?)
    ORDER BY datetime(p.criado_em) DESC
    LIMIT 30
  `, [ultimaLeituraEm]);
}

async function marcarProdutosNotificacoesLidas(usuarioId) {
  await dbRun(`
    INSERT INTO leituras_notificacoes_produtos (usuario_id, ultima_leitura_em)
    VALUES (?, CURRENT_TIMESTAMP)
    ON CONFLICT(usuario_id) DO UPDATE SET ultima_leitura_em = CURRENT_TIMESTAMP
  `, [usuarioId]);
}

// ---------------------------------------------------------------------
// CONVERSAS PRIVADAS / GRUPOS
// ---------------------------------------------------------------------

async function getContatos(usuarioId) {
  return dbAll(`SELECT id, nome, foto, tipo_acesso, whatsapp FROM usuarios WHERE id != ? ORDER BY nome ASC`, [usuarioId]);
}

async function getOuCriarConversaIndividual(usuarioA, usuarioB) {
  const existente = await dbGet(`
    SELECT cp1.conversa_id AS id
    FROM conversa_participantes cp1
    JOIN conversa_participantes cp2 ON cp2.conversa_id = cp1.conversa_id
    JOIN conversas c ON c.id = cp1.conversa_id
    WHERE cp1.usuario_id = ? AND cp2.usuario_id = ? AND c.nome IS NULL
      AND (SELECT COUNT(*) FROM conversa_participantes WHERE conversa_id = cp1.conversa_id) = 2
  `, [usuarioA, usuarioB]);
  if (existente) return existente.id;

  const conversa = await dbRun('INSERT INTO conversas (nome) VALUES (NULL)');
  const id = conversa.lastID;
  await dbRun('INSERT INTO conversa_participantes (conversa_id, usuario_id) VALUES (?, ?)', [id, usuarioA]);
  await dbRun('INSERT INTO conversa_participantes (conversa_id, usuario_id) VALUES (?, ?)', [id, usuarioB]);
  return id;
}

async function criarConversaGrupo(nome, participantesIds) {
  const conversa = await dbRun('INSERT INTO conversas (nome) VALUES (?)', [nome]);
  const id = conversa.lastID;
  for (const usuarioId of participantesIds) {
    await dbRun('INSERT INTO conversa_participantes (conversa_id, usuario_id) VALUES (?, ?)', [id, usuarioId]);
  }
  return id;
}

async function usuarioParticipaConversa(conversaId, usuarioId) {
  const row = await dbGet('SELECT 1 FROM conversa_participantes WHERE conversa_id = ? AND usuario_id = ?', [conversaId, usuarioId]);
  return !!row;
}

async function getConversaBasica(conversaId) {
  return dbGet('SELECT id, nome, foto FROM conversas WHERE id = ?', [conversaId]);
}

async function getParticipantesConversa(conversaId) {
  return dbAll(`
    SELECT u.id, u.nome, u.foto, u.tipo_acesso
    FROM conversa_participantes cp
    JOIN usuarios u ON u.id = cp.usuario_id
    WHERE cp.conversa_id = ?
    ORDER BY u.nome ASC
  `, [conversaId]);
}

// Só atualiza a foto se a conversa for um grupo (nome preenchido); conversas
// individuais não têm "foto de grupo" própria (usam a foto da outra pessoa).
async function atualizarFotoConversaGrupo(conversaId, foto) {
  const resultado = await dbRun(
    'UPDATE conversas SET foto = ? WHERE id = ? AND nome IS NOT NULL',
    [foto, conversaId]
  );
  return resultado.changes > 0;
}

async function getConversasDoUsuario(usuarioId) {
  const conversas = await dbAll(`
   SELECT c.id, c.nome, c.foto, cp.arquivada, cp.fixada
    FROM conversas c
    JOIN conversa_participantes cp ON cp.conversa_id = c.id
    WHERE cp.usuario_id = ?
  `, [usuarioId]);

  const resultado = [];
  for (const c of conversas) {
    const outros = await dbAll(`
      SELECT u.id, u.nome, u.foto
      FROM conversa_participantes cp JOIN usuarios u ON u.id = cp.usuario_id
      WHERE cp.conversa_id = ? AND cp.usuario_id != ?
    `, [c.id, usuarioId]);

    const ultima = await dbGet(`
      SELECT texto, remetente_id, criado_em FROM conversa_mensagens
      WHERE conversa_id = ? ORDER BY datetime(criado_em) DESC LIMIT 1
    `, [c.id]);

    const leitura = await dbGet('SELECT ultima_leitura_em FROM conversa_leituras WHERE conversa_id = ? AND usuario_id = ?', [c.id, usuarioId]);
    const ultimaLeituraEm = leitura ? leitura.ultima_leitura_em : '1970-01-01 00:00:00';

    const contagem = await dbGet(`
      SELECT COUNT(*) AS total FROM conversa_mensagens
      WHERE conversa_id = ? AND remetente_id != ? AND datetime(criado_em) > datetime(?)
    `, [c.id, usuarioId, ultimaLeituraEm]);

    const ehGrupo = !!c.nome;

    resultado.push({
      id: c.id,
      nome: c.nome || (outros[0] ? outros[0].nome : 'Conversa'),
      grupo: ehGrupo,
      foto: ehGrupo ? (c.foto || null) : (outros[0] ? outros[0].foto : null),
      participantes: outros,
      ultima_mensagem: ultima ? ultima.texto : null,
      ultima_mensagem_em: ultima ? ultima.criado_em : null,
      nao_lidas: contagem.total,
      arquivada: !!c.arquivada,
      fixada: !!c.fixada
    });
  }

  return resultado.sort((a, b) => {
    if (!!b.fixada !== !!a.fixada) return (b.fixada ? 1 : 0) - (a.fixada ? 1 : 0);
    return new Date(b.ultima_mensagem_em || 0) - new Date(a.ultima_mensagem_em || 0);
  });
}

async function getMensagensConversa(conversaId) {
  return dbAll(`
    SELECT m.id, m.remetente_id, m.texto, m.criado_em, m.editado_em, u.nome AS remetente_nome
    FROM conversa_mensagens m JOIN usuarios u ON u.id = m.remetente_id
    WHERE m.conversa_id = ? ORDER BY datetime(m.criado_em) ASC
  `, [conversaId]);
}

async function enviarMensagemConversa(conversaId, remetenteId, texto) {
  await dbRun('INSERT INTO conversa_mensagens (conversa_id, remetente_id, texto) VALUES (?, ?, ?)', [conversaId, remetenteId, texto]);
  await marcarConversaLida(conversaId, remetenteId);
}

async function editarMensagemConversa(mensagemId, remetenteId, texto) {
  const resultado = await dbRun(
    'UPDATE conversa_mensagens SET texto = ?, editado_em = CURRENT_TIMESTAMP WHERE id = ? AND remetente_id = ?',
    [texto, mensagemId, remetenteId]
  );
  return resultado.changes > 0;
}

async function excluirMensagemConversa(mensagemId, remetenteId) {
  const resultado = await dbRun(
    'DELETE FROM conversa_mensagens WHERE id = ? AND remetente_id = ?',
    [mensagemId, remetenteId]
  );
  return resultado.changes > 0;
}

async function marcarConversaLida(conversaId, usuarioId) {
  await dbRun(`
    INSERT INTO conversa_leituras (conversa_id, usuario_id, ultima_leitura_em)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(conversa_id, usuario_id) DO UPDATE SET ultima_leitura_em = CURRENT_TIMESTAMP
  `, [conversaId, usuarioId]);
}

async function arquivarConversa(conversaId, usuarioId, arquivada) {
  const resultado = await dbRun(
    'UPDATE conversa_participantes SET arquivada = ? WHERE conversa_id = ? AND usuario_id = ?',
    [arquivada ? 1 : 0, conversaId, usuarioId]
  );
  return resultado.changes > 0;
}

async function fixarConversa(conversaId, usuarioId, fixada) {
  const resultado = await dbRun(
    'UPDATE conversa_participantes SET fixada = ? WHERE conversa_id = ? AND usuario_id = ?',
    [fixada ? 1 : 0, conversaId, usuarioId]
  );
  return resultado.changes > 0;
}

// "Excluir contato" remove a conversa da lista deste usuário (sai da
// conversa). Se voltar a conversar com a mesma pessoa, uma conversa nova é
// criada do zero.
async function excluirConversaParaUsuario(conversaId, usuarioId) {
  const resultado = await dbRun(
    'DELETE FROM conversa_participantes WHERE conversa_id = ? AND usuario_id = ?',
    [conversaId, usuarioId]
  );
  return resultado.changes > 0;
}

async function removerParticipanteGrupo(conversaId, usuarioId) {
  const resultado = await dbRun(
    'DELETE FROM conversa_participantes WHERE conversa_id = ? AND usuario_id = ?',
    [conversaId, usuarioId]
  );
  return resultado.changes > 0;
}

// ---------------------------------------------------------------------
// FECHAMENTO (BAIXA) DE PRODUTOS — histórico por dia
// ---------------------------------------------------------------------

async function getProdutoPorId(id) {
  return dbGet('SELECT * FROM produtos WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------
// SENHA DO USUÁRIO
// ---------------------------------------------------------------------

async function getUsuarioComSenha(usuarioId) {
  return dbGet('SELECT id, senha FROM usuarios WHERE id = ?', [usuarioId]);
}

async function atualizarSenhaUsuario(usuarioId, senhaHash) {
  const resultado = await dbRun('UPDATE usuarios SET senha = ? WHERE id = ?', [senhaHash, usuarioId]);
  return resultado.changes > 0;
}

// Regra: mesmo produto + mesmo dia + mesmo valor de sobra = duplicado (não salva).
// Dia diferente OU valor diferente = salva (grava novo dia, ou atualiza o registro daquele dia).
async function registrarBaixaProduto(produtoId, dataFeira, sobra, quantidadeVendida) {
  const existente = await dbGet(
    'SELECT * FROM produtos_baixas WHERE produto_id = ? AND data_feira = ?',
    [produtoId, dataFeira]
  );

  if (existente) {
    await dbRun(
      'UPDATE produtos_baixas SET quantidade_sobra = ?, quantidade_vendida = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [sobra, quantidadeVendida, existente.id]
    );
  } else {
    await dbRun(
      'INSERT INTO produtos_baixas (produto_id, data_feira, quantidade_sobra, quantidade_vendida) VALUES (?, ?, ?, ?)',
      [produtoId, dataFeira, sobra, quantidadeVendida]
    );
  }

  // Roda sempre — mesmo quando já existia um fechamento igual pra hoje —
  // porque é essa linha que faz o produto sair de "pendente" pra "fechado"
  // de verdade no banco. Antes, quando já existia um registro igual, essa
  // atualização era pulada e o produto voltava a aparecer como pendente
  // depois de recarregar a página.
  await dbRun(
    'UPDATE produtos SET quantidade_sobra = ?, baixa_em = CURRENT_TIMESTAMP WHERE id = ?',
    [sobra, produtoId]
  );

  return { duplicado: false };
}

async function reabrirBaixaProduto(produtoId) {
  await dbRun(
    'UPDATE produtos SET quantidade_sobra = NULL, baixa_em = NULL WHERE id = ?',
    [produtoId]
  );
}

async function getResumoOfertaDemanda() {
  const row = await dbGet(`
    SELECT
      COALESCE(SUM(quantidade_valor), 0) AS total_trazido,
      COALESCE(SUM(CASE WHEN baixa_em IS NOT NULL THEN (quantidade_valor - COALESCE(quantidade_sobra, 0)) ELSE 0 END), 0) AS total_vendido
    FROM produtos
    WHERE quantidade_valor IS NOT NULL
  `);
  return row;
}

async function getSobrasPorCategoria() {
  return dbAll(`
    SELECT
      categoria,
      COALESCE(SUM(quantidade_valor), 0) AS total_trazido,
      COALESCE(SUM(CASE WHEN baixa_em IS NOT NULL THEN quantidade_sobra ELSE 0 END), 0) AS total_sobra,
      COALESCE(SUM(CASE WHEN baixa_em IS NOT NULL THEN (quantidade_valor - COALESCE(quantidade_sobra, 0)) ELSE 0 END), 0) AS total_vendido
    FROM produtos
    WHERE quantidade_valor IS NOT NULL
    GROUP BY categoria
    ORDER BY total_sobra DESC
  `);
}

async function getVolumePorProdutor() {
  return dbAll(`
    SELECT
      u.id AS produtor_id,
      u.nome AS produtor_nome,
      COALESCE(SUM(p.quantidade_valor), 0) AS total_trazido,
      COALESCE(SUM(CASE WHEN p.baixa_em IS NOT NULL THEN (p.quantidade_valor - COALESCE(p.quantidade_sobra, 0)) ELSE 0 END), 0) AS total_vendido,
      COALESCE(SUM(CASE WHEN p.baixa_em IS NOT NULL THEN p.quantidade_sobra ELSE 0 END), 0) AS total_sobra
    FROM usuarios u
    JOIN produtos p ON p.produtor_id = u.id AND p.quantidade_valor IS NOT NULL
    WHERE u.tipo_acesso = 'produtor'
    GROUP BY u.id, u.nome
    ORDER BY u.nome ASC
  `);
}

async function toggleCurtidaComentario(comentarioId, googleId) {
  const existente = await dbGet(
    'SELECT id FROM comentario_curtidas WHERE comentario_id = ? AND google_id = ?',
    [comentarioId, googleId]
  );
  if (existente) {
    await dbRun('DELETE FROM comentario_curtidas WHERE id = ?', [existente.id]);
  } else {
    await dbRun('INSERT INTO comentario_curtidas (comentario_id, google_id) VALUES (?, ?)', [comentarioId, googleId]);
  }
   const contagem = await dbGet('SELECT COUNT(*) AS total FROM comentario_curtidas WHERE comentario_id = ?', [comentarioId]);
  return { curtido: !existente, curtidas: contagem.total };
}

async function toggleInteresseProduto(produtoId, googleId) {
  const existente = await dbGet(
    'SELECT id FROM produto_interesses WHERE produto_id = ? AND google_id = ?',
    [produtoId, googleId]
  );
  if (existente) {
    await dbRun('DELETE FROM produto_interesses WHERE id = ?', [existente.id]);
  } else {
    await dbRun('INSERT INTO produto_interesses (produto_id, google_id) VALUES (?, ?)', [produtoId, googleId]);
  }
  const contagem = await dbGet('SELECT COUNT(*) AS total FROM produto_interesses WHERE produto_id = ?', [produtoId]);
  return { interessado_por_mim: !existente, total: contagem.total };
}

async function getInteresseProduto(produtoId, googleId = null) {
  const contagem = await dbGet('SELECT COUNT(*) AS total FROM produto_interesses WHERE produto_id = ?', [produtoId]);
  const interessado_por_mim = googleId
    ? !!(await dbGet('SELECT 1 FROM produto_interesses WHERE produto_id = ? AND google_id = ?', [produtoId, googleId]))
    : false;
  return { total: contagem.total, interessado_por_mim };
}

async function criarComentarioProduto(produtoId, nomeVisitante, texto, avatarUrl, autorGoogleId) {
  await dbRun(
    'INSERT INTO comentarios_produtos (produto_id, nome_visitante, texto, avatar_url, autor_google_id) VALUES (?, ?, ?, ?, ?)',
    [produtoId, nomeVisitante, texto, avatarUrl || null, autorGoogleId || null]
  );
}

async function getComentariosProduto(produtoId, googleId = null) {
  const comentarios = await dbAll(`
    SELECT c.id, c.nome_visitante, c.texto, c.criado_em, c.avatar_url,
      (SELECT COUNT(*) FROM comentario_curtidas WHERE comentario_id = c.id) AS curtidas
    FROM comentarios_produtos c
    WHERE c.produto_id = ?
    ORDER BY datetime(c.criado_em) DESC
  `, [produtoId]);

  for (const c of comentarios) {
    c.curtido_por_mim = googleId
      ? !!(await dbGet('SELECT 1 FROM comentario_curtidas WHERE comentario_id = ? AND google_id = ?', [c.id, googleId]))
      : false;
  }
  return comentarios;
}

async function excluirComentarioProduto(id) {
  const resultado = await dbRun('DELETE FROM comentarios_produtos WHERE id = ?', [id]);
  return resultado.changes > 0;
}

// Usado na hora de excluir, pra checar se quem está tentando apagar é
// mesmo o dono do produto (ou admin) — sem isso, qualquer produtor
// logado poderia apagar comentário de produto de outro produtor.
async function getComentarioComProdutor(id) {
  return dbGet(`
    SELECT c.id, c.produto_id, p.produtor_id
    FROM comentarios_produtos c
    JOIN produtos p ON p.id = c.produto_id
    WHERE c.id = ?
  `, [id]);
}

async function getProdutorPublicoPorId(id) {
  const produtor = await dbGet(
    `SELECT id, nome, foto, comunidade, whatsapp FROM usuarios WHERE id = ? AND tipo_acesso = 'produtor'`,
    [id]
  );
  if (!produtor) return null;

    const produtos = await dbAll(
    'SELECT id, nome, categoria, imagem FROM produtos WHERE produtor_id = ? ORDER BY nome ASC',
    [id]
  );

   for (const produto of produtos) {
    produto.comentarios = await getComentariosProduto(produto.id);
    produto.total_interesses = (await getInteresseProduto(produto.id)).total;
  }

  // Ordena por quantidade de corações (decrescente). Quem tem mais coração
  // fica na frente; em empate, mantém a ordem alfabética que já veio do
  // SELECT (sort do JS é estável, então empates não embaralham).
  produtos.sort((a, b) => b.total_interesses - a.total_interesses);

  if (produtos[0] && produtos[0].total_interesses > 0) {
    produtos[0].mais_cobicado = true;
  }

  return { ...produtor, produtos };
}

// ---------------------------------------------------------------------
// TICKETS
// ---------------------------------------------------------------------

async function getProdutoresParaSelect() {
  return dbAll(`SELECT id, nome FROM usuarios WHERE tipo_acesso = 'produtor' ORDER BY nome ASC`);
}

async function getResumoTickets() {
  const row = await dbGet(`
    SELECT
      COALESCE(SUM(t.quantidade), 0) AS total_tickets,
      COALESCE(SUM(t.quantidade * t.valor_unitario), 0) AS total_valor,
      COUNT(DISTINCT t.produtor_id) AS produtores_ativos
    FROM tickets t
    JOIN usuarios u ON u.id = t.produtor_id
    WHERE t.excluido_em IS NULL
  `);
  return row;
}

async function getTicketsCompletos() {
  return dbAll(`
    SELECT t.id, t.produtor_id, u.nome AS produtor_nome, t.data_feira, t.quantidade, t.valor_unitario, t.criado_em, t.pago_em
    FROM tickets t
    JOIN usuarios u ON u.id = t.produtor_id
    WHERE t.excluido_em IS NULL
    ORDER BY datetime(t.criado_em) DESC
  `);
}

async function getMeusTicketsCompletos(produtorId) {
  return dbAll(`
    SELECT id, produtor_id, data_feira, quantidade, valor_unitario, criado_em, pago_em
    FROM tickets
    WHERE produtor_id = ? AND excluido_em IS NULL
    ORDER BY datetime(criado_em) DESC
  `, [produtorId]);
}

async function getMeuResumoTickets(produtorId) {
  const row = await dbGet(`
    SELECT
      COALESCE(SUM(quantidade), 0) AS total_tickets,
      COALESCE(SUM(CASE WHEN pago_em IS NULL THEN quantidade * valor_unitario ELSE 0 END), 0) AS valor_pendente,
      COALESCE(SUM(CASE WHEN pago_em IS NOT NULL THEN quantidade * valor_unitario ELSE 0 END), 0) AS total_pago
    FROM tickets
    WHERE produtor_id = ? AND excluido_em IS NULL
  `, [produtorId]);
  return row;
}

async function criarTicket(produtorId, dataFeira, quantidade, valorUnitario) {
  await dbRun(
    'INSERT INTO tickets (produtor_id, data_feira, quantidade, valor_unitario) VALUES (?, ?, ?, ?)',
    [produtorId, dataFeira, quantidade, valorUnitario]
  );
}

async function editarTicket(id, dataFeira, quantidade, valorUnitario) {
  await dbRun(
    'UPDATE tickets SET data_feira = ?, quantidade = ?, valor_unitario = ? WHERE id = ?',
    [dataFeira, quantidade, valorUnitario, id]
  );
}

async function getLixeiraTickets() {
  return dbAll(`
    SELECT t.id, t.produtor_id, u.nome AS produtor_nome, t.data_feira, t.quantidade, t.valor_unitario, t.excluido_em
    FROM tickets t
    JOIN usuarios u ON u.id = t.produtor_id
    WHERE t.excluido_em IS NOT NULL
    ORDER BY datetime(t.excluido_em) DESC
  `);
}

async function restaurarTicketsLote(ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await dbRun(`UPDATE tickets SET excluido_em = NULL WHERE id IN (${placeholders})`, ids);
}

async function esvaziarLixeiraTickets() {
  await dbRun('DELETE FROM tickets WHERE excluido_em IS NOT NULL');
}

async function excluirTicketsLote(ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await dbRun(`UPDATE tickets SET excluido_em = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, ids);
}

async function marcarTicketsPagos(ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await dbRun(`UPDATE tickets SET pago_em = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, ids);
}

async function desmarcarTicketsPagos(ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await dbRun(`UPDATE tickets SET pago_em = NULL WHERE id IN (${placeholders})`, ids);
}

// ---------------------------------------------------------------------
// PRODUTORES / PRODUTOS (visão do painel)
// ---------------------------------------------------------------------

function calcularStatusFechamento(produtos) {
  const comMeta = produtos.filter((p) => p.quantidade_valor !== null && p.quantidade_valor !== undefined);
  const totalComBaixa = comMeta.filter((p) => p.baixa_em).length;
  let statusFechamento = 'pendente';
  if (comMeta.length && totalComBaixa === comMeta.length) statusFechamento = 'concluido';
  else if (totalComBaixa > 0) statusFechamento = 'em_andamento';
  return { statusFechamento, totalComBaixa, totalComMeta: comMeta.length };
}

async function getProdutoresComProdutos() {
  const produtores = await dbAll(`SELECT id, nome, email, foto, comunidade, status FROM usuarios WHERE tipo_acesso = 'produtor' ORDER BY nome ASC`);
  const resultado = [];
  for (const produtor of produtores) {
    const produtos = await dbAll(
      'SELECT id, nome, categoria, quantidade, quantidade_valor, unidade, quantidade_sobra, baixa_em, imagem FROM produtos WHERE produtor_id = ? ORDER BY nome ASC',
      [produtor.id]
    );
    const { statusFechamento, totalComBaixa, totalComMeta } = calcularStatusFechamento(produtos);
    resultado.push({
      ...produtor,
      produtos,
      status_fechamento: statusFechamento,
      total_com_baixa: totalComBaixa,
      total_com_meta: totalComMeta
    });
  }
  return resultado;
}

async function getProdutorComProdutos(produtorId) {
  const produtor = await dbGet('SELECT id, nome, email, foto, comunidade, status FROM usuarios WHERE id = ?', [produtorId]);
  if (!produtor) return null;
  const produtos = await dbAll(
    'SELECT id, nome, categoria, quantidade, quantidade_valor, unidade, quantidade_sobra, baixa_em, imagem FROM produtos WHERE produtor_id = ? ORDER BY nome ASC',
    [produtorId]
  );
  return { produtor, produtos };
}

async function criarProduto({ produtorId, nome, categoria, quantidadeValor, quantidade, unidade, imagem }) {
  await dbRun(
    `INSERT INTO produtos (produtor_id, nome, categoria, quantidade, quantidade_valor, unidade, imagem, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [produtorId, nome, categoria, quantidade || null, quantidadeValor || null, unidade || 'kg', imagem || null]
  );
}

async function editarProduto(id, { nome, categoria, quantidadeValor, quantidade, imagem }) {
  const resultado = await dbRun(
    `UPDATE produtos SET nome = ?, categoria = ?, quantidade = ?, quantidade_valor = ?, imagem = COALESCE(?, imagem) WHERE id = ?`,
    [nome, categoria, quantidade || null, quantidadeValor || null, imagem || null, id]
  );
  return resultado.changes > 0;
}

async function excluirProduto(id) {
  const resultado = await dbRun('DELETE FROM produtos WHERE id = ?', [id]);
  return resultado.changes > 0;
}

async function atualizarStatusUsuario(usuarioId, status) {
  const resultado = await dbRun('UPDATE usuarios SET status = ? WHERE id = ?', [status, usuarioId]);
  return resultado.changes > 0;
}

async function criarProdutor({ nome, email, senhaHash, comunidade }) {
  const resultado = await dbRun(
    `INSERT INTO usuarios (nome, email, senha, comunidade, tipo_acesso, status) VALUES (?, ?, ?, ?, 'produtor', 'ativo')`,
    [nome, email, senhaHash, comunidade || '']
  );
  return resultado.lastID;
}

async function editarProdutor(id, { nome, email, comunidade, foto, senhaHash }) {
  const resultado = await dbRun(
    `UPDATE usuarios SET nome = ?, email = ?, comunidade = ?, foto = COALESCE(?, foto), senha = COALESCE(?, senha) WHERE id = ? AND tipo_acesso = 'produtor'`,
    [nome, email, comunidade, foto || null, senhaHash || null, id]
  );
  return resultado.changes > 0;
}

async function excluirProdutor(id) {
  const resultado = await dbRun(`DELETE FROM usuarios WHERE id = ? AND tipo_acesso = 'produtor'`, [id]);
  return resultado.changes > 0;
}

async function criarAdministrador({ nome, email, senhaHash }) {
  const resultado = await dbRun(
    `INSERT INTO usuarios (nome, email, senha, comunidade, tipo_acesso, status) VALUES (?, ?, ?, '', 'admin', 'ativo')`,
    [nome, email, senhaHash]
  );
  return resultado.lastID;
}

module.exports = {
  criarComentarioProduto,
  getComentariosProduto,
  excluirComentarioProduto,
  getComentarioComProdutor,
  toggleInteresseProduto,
  getInteresseProduto,
  criarProduto,
  editarProduto,
  excluirProduto,
  atualizarStatusUsuario,
  criarProdutor,
  editarProdutor,
  excluirProdutor,
  criarAdministrador,
  getProdutorPublicoPorId,
  getUsuarioComSenha,
  atualizarSenhaUsuario,
  getResumoOfertaDemanda,
  getSobrasPorCategoria,
  getVolumePorProdutor,
  removerParticipanteGrupo,
  getProdutoPorId,
  registrarBaixaProduto,
  reabrirBaixaProduto,
  db,
  initDatabase,
  getMensagensMural,
  editarMensagemMural,
  excluirMensagemMural,
  getMuralNotificacoes,
  marcarMuralNotificacaoVista,
  getProdutosNotificacoes,
  marcarProdutosNotificacoesLidas,
  getContatos,
  getOuCriarConversaIndividual,
  criarConversaGrupo,
  usuarioParticipaConversa,
  getConversaBasica,
  getParticipantesConversa,
  atualizarFotoConversaGrupo,
  getConversasDoUsuario,
  getMensagensConversa,
  enviarMensagemConversa,
  editarMensagemConversa,
  excluirMensagemConversa,
  marcarConversaLida,
  arquivarConversa,
  fixarConversa,
  excluirConversaParaUsuario,
  getProdutoresParaSelect,
  getResumoTickets,
  getTicketsCompletos,
  getMeusTicketsCompletos,
  getMeuResumoTickets,
  criarTicket,
  editarTicket,
  excluirTicketsLote,
  marcarTicketsPagos,
  desmarcarTicketsPagos,
  getLixeiraTickets,
  restaurarTicketsLote,
  esvaziarLixeiraTickets,
  getProdutoresComProdutos,
  getProdutorComProdutos
};
