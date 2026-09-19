const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Conexão com o Supabase usando a variável de ambiente do Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// DECLARAÇÃO DO DB QUE FALTAVA:
const db = {
  query: (text, params) => pool.query(text, params)
};

// Funções auxiliares para manter compatibilidade
async function dbAll(sql, params = []) {
  let paramIndex = 1;
  const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
  const { rows } = await pool.query(pgSql, params);
  return rows;
}

async function dbGet(sql, params = []) {
  let paramIndex = 1;
  const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
  const { rows } = await pool.query(pgSql, params);
  return rows[0] || null;
}

async function dbRun(sql, params = []) {
  let paramIndex = 1;
  const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
  const res = await pool.query(pgSql, params);
  return {
    changes: res.rowCount,
    lastID: res.rows[0] ? res.rows[0].id : null
  };
}

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha TEXT NOT NULL,
      foto TEXT,
      comunidade TEXT NOT NULL,
      tipo_acesso TEXT NOT NULL CHECK(tipo_acesso IN ('admin', 'produtor')),
      status TEXT NOT NULL DEFAULT 'ativo' CHECK(status IN ('ativo', 'invisivel')),
      whatsapp TEXT
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      produtor_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      data_feira TEXT NOT NULL,
      quantidade INTEGER NOT NULL,
      valor_unitario REAL NOT NULL,
      excluido_em TIMESTAMP,
      pago_em TIMESTAMP,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS produtos (
      id SERIAL PRIMARY KEY,
      produtor_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      categoria TEXT NOT NULL,
      quantidade TEXT,
      quantidade_valor REAL,
      unidade TEXT,
      quantidade_sobra REAL,
      baixa_em TIMESTAMP,
      imagem TEXT,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS produtos_baixas (
      id SERIAL PRIMARY KEY,
      produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
      data_feira TEXT NOT NULL,
      quantidade_sobra REAL NOT NULL,
      quantidade_vendida REAL,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP,
      UNIQUE(produto_id, data_feira)
    );

    CREATE TABLE IF NOT EXISTS comentarios_produtos (
      id SERIAL PRIMARY KEY,
      produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
      nome_visitante TEXT NOT NULL,
      texto TEXT NOT NULL,
      avatar_url TEXT,
      autor_google_id TEXT,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS comentario_curtidas (
      id SERIAL PRIMARY KEY,
      comentario_id INTEGER NOT NULL REFERENCES comentarios_produtos(id) ON DELETE CASCADE,
      google_id TEXT NOT NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(comentario_id, google_id)
    );

    CREATE TABLE IF NOT EXISTS produto_interesses (
      id SERIAL PRIMARY KEY,
      produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
      google_id TEXT NOT NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(produto_id, google_id)
    );

    CREATE TABLE IF NOT EXISTS mensagens (
      id SERIAL PRIMARY KEY,
      remetente_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      texto TEXT NOT NULL,
      editado_em TIMESTAMP,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversas (
      id SERIAL PRIMARY KEY,
      nome TEXT,
      foto TEXT,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversa_participantes (
      conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      arquivada INTEGER NOT NULL DEFAULT 0,
      fixada INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (conversa_id, usuario_id)
    );

    CREATE TABLE IF NOT EXISTS conversa_mensagens (
      id SERIAL PRIMARY KEY,
      conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
      remetente_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      texto TEXT NOT NULL,
      editado_em TIMESTAMP,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversa_leituras (
      conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      ultima_leitura_em TIMESTAMP NOT NULL DEFAULT '1970-01-01 00:00:00',
      PRIMARY KEY (conversa_id, usuario_id)
    );

    CREATE TABLE IF NOT EXISTS leituras_mural (
      usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
      ultima_leitura_em TIMESTAMP NOT NULL DEFAULT '1970-01-01 00:00:00'
    );

    CREATE TABLE IF NOT EXISTS leituras_notificacoes_produtos (
      usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
      ultima_leitura_em TIMESTAMP NOT NULL DEFAULT '1970-01-01 00:00:00'
    );

    CREATE TABLE IF NOT EXISTS avisos_notificacao_vistos (
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      mensagem_id INTEGER NOT NULL REFERENCES mensagens(id) ON DELETE CASCADE,
      PRIMARY KEY (usuario_id, mensagem_id)
    );

    CREATE TABLE IF NOT EXISTS produtos_notificacao_vistos (
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
      PRIMARY KEY (usuario_id, produto_id)
    );
  `);

  const row = await dbGet('SELECT COUNT(*) AS total FROM usuarios');
  if (parseInt(row.total, 10) === 0) {
    const senhaAdmin = bcrypt.hashSync('admin123', 10);

    await dbRun(
      `INSERT INTO usuarios (nome, email, senha, foto, comunidade, tipo_acesso, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['Marina da Feira', 'admin@vitrineagro.local', senhaAdmin, null, 'Coordenação Central', 'admin', 'ativo']
    );

    const mensagensSeed = [
      [1, 'Bem-vindos ao painel da feira! Usem este mural para avisos e alinhamentos.', '2026-08-10 09:00:00']
    ];
    for (const m of mensagensSeed) {
      await dbRun('INSERT INTO mensagens (remetente_id, texto, criado_em) VALUES ($1, $2, $3)', m);
    }
  }
}

// ---------------------------------------------------------------------
// MURAL (avisos gerais)
// ---------------------------------------------------------------------

async function getMensagensMural(limite = 30) {
  return dbAll(`
    SELECT m.id, m.texto, m.criado_em, m.editado_em, m.remetente_id,
           u.nome AS remetente_nome, u.tipo_acesso
    FROM mensagens m
    JOIN usuarios u ON u.id = m.remetente_id
    ORDER BY m.criado_em DESC
    LIMIT $1
  `, [limite]);
}

// Fotos de todos os usuários, buscadas de uma vez só (payload pequeno,
// já que cada foto aparece uma única vez, em vez de repetida em cada
// mensagem do mural — que era o que deixava o carregamento lento).
async function getMapaAvatares() {
  return dbAll('SELECT id, foto FROM usuarios');
}

async function editarMensagemMural(id, texto) {
  const resultado = await dbRun(
    'UPDATE mensagens SET texto = $1, editado_em = CURRENT_TIMESTAMP WHERE id = $2',
    [texto, id]
  );
  return resultado.changes > 0;
}

async function excluirMensagemMural(id) {
  const resultado = await dbRun('DELETE FROM mensagens WHERE id = $1', [id]);
  return resultado.changes > 0;
}

async function getMuralNotificacoes(usuarioId) {
  return dbAll(`
    SELECT m.id, m.texto, m.criado_em, u.nome AS remetente_nome
    FROM mensagens m
    JOIN usuarios u ON u.id = m.remetente_id
    WHERE m.id NOT IN (
      SELECT mensagem_id FROM avisos_notificacao_vistos WHERE usuario_id = $1
    )
    ORDER BY m.criado_em DESC
    LIMIT 30
  `, [usuarioId]);
}

async function marcarMuralNotificacaoVista(usuarioId, mensagemId) {
  await dbRun(
    'INSERT INTO avisos_notificacao_vistos (usuario_id, mensagem_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [usuarioId, mensagemId]
  );
}

// ---------------------------------------------------------------------
// NOTIFICAÇÕES DE NOVOS PRODUTOS
// ---------------------------------------------------------------------

async function getProdutosNotificacoes(usuarioId) {
  // Cada produto só some da lista quando o próprio produto é marcado
  // como visto (clique na notificação) — não mais todos de uma vez
  // ao abrir o sino.
  return dbAll(`
    SELECT p.id, p.nome AS produto_nome, p.produtor_id, p.criado_em,
           u.nome AS produtor_nome, u.foto AS produtor_foto
    FROM produtos p
    JOIN usuarios u ON u.id = p.produtor_id
    WHERE p.criado_em IS NOT NULL
      AND p.id NOT IN (
        SELECT produto_id FROM produtos_notificacao_vistos WHERE usuario_id = $1
      )
    ORDER BY p.criado_em DESC
    LIMIT 30
  `, [usuarioId]);
}

async function marcarProdutosNotificacoesLidas(usuarioId) {
  await dbRun(`
    INSERT INTO leituras_notificacoes_produtos (usuario_id, ultima_leitura_em)
    VALUES ($1, CURRENT_TIMESTAMP)
    ON CONFLICT(usuario_id) DO UPDATE SET ultima_leitura_em = CURRENT_TIMESTAMP
  `, [usuarioId]);
}

async function marcarProdutoNotificacaoVisto(usuarioId, produtoId) {
  await dbRun(
    'INSERT INTO produtos_notificacao_vistos (usuario_id, produto_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [usuarioId, produtoId]
  );
}

// ---------------------------------------------------------------------
// CONVERSAS PRIVADAS / GRUPOS
// ---------------------------------------------------------------------

async function getContatos(usuarioId) {
  return dbAll(`SELECT id, nome, foto, tipo_acesso, whatsapp FROM usuarios WHERE id != $1 ORDER BY nome ASC`, [usuarioId]);
}

async function getOuCriarConversaIndividual(usuarioA, usuarioB) {
  const existente = await dbGet(`
    SELECT cp1.conversa_id AS id
    FROM conversa_participantes cp1
    JOIN conversa_participantes cp2 ON cp2.conversa_id = cp1.conversa_id
    JOIN conversas c ON c.id = cp1.conversa_id
    WHERE cp1.usuario_id = $1 AND cp2.usuario_id = $2 AND c.nome IS NULL
      AND (SELECT COUNT(*) FROM conversa_participantes WHERE conversa_id = cp1.conversa_id) = 2
  `, [usuarioA, usuarioB]);
  if (existente) return existente.id;

  const conversa = await dbRun('INSERT INTO conversas (nome) VALUES (NULL) RETURNING id', []);
  const id = conversa.lastID;
  await dbRun('INSERT INTO conversa_participantes (conversa_id, usuario_id) VALUES ($1, $2)', [id, usuarioA]);
  await dbRun('INSERT INTO conversa_participantes (conversa_id, usuario_id) VALUES ($1, $2)', [id, usuarioB]);
  return id;
}

async function criarConversaGrupo(nome, participantesIds) {
  const conversa = await dbRun('INSERT INTO conversas (nome) VALUES ($1) RETURNING id', [nome]);
  const id = conversa.lastID;
  for (const usuarioId of participantesIds) {
    await dbRun('INSERT INTO conversa_participantes (conversa_id, usuario_id) VALUES ($1, $2)', [id, usuarioId]);
  }
  return id;
}

async function usuarioParticipaConversa(conversaId, usuarioId) {
  const row = await dbGet('SELECT 1 FROM conversa_participantes WHERE conversa_id = $1 AND usuario_id = $2', [conversaId, usuarioId]);
  return !!row;
}

async function getConversaBasica(conversaId) {
  return dbGet('SELECT id, nome, foto FROM conversas WHERE id = $1', [conversaId]);
}

async function getParticipantesConversa(conversaId) {
  return dbAll(`
    SELECT u.id, u.nome, u.foto, u.tipo_acesso
    FROM conversa_participantes cp
    JOIN usuarios u ON u.id = cp.usuario_id
    WHERE cp.conversa_id = $1
    ORDER BY u.nome ASC
  `, [conversaId]);
}

async function atualizarFotoConversaGrupo(conversaId, foto) {
  const resultado = await dbRun(
    'UPDATE conversas SET foto = $1 WHERE id = $2 AND nome IS NOT NULL',
    [foto, conversaId]
  );
  return resultado.changes > 0;
}

async function getConversasDoUsuario(usuarioId) {
  // Antes: 1 consulta para listar as conversas + 4 consultas POR
  // CONVERSA (participantes, última mensagem, leitura, contagem de
  // não lidas), todas sequenciais. Com N conversas isso virava até
  // 1 + 4*N idas e voltas ao banco — cada uma com a latência de rede
  // até o Supabase — e é isso que deixava a tela de mensagens lenta.
  // Agora: tudo isso sai em só 2 consultas, usando LATERAL/JOIN para
  // já trazer a última mensagem e a contagem de não lidas junto.
  const conversas = await dbAll(`
    SELECT c.id, c.nome, c.foto, cp.arquivada, cp.fixada,
           ultima.texto AS ultima_mensagem,
           ultima.criado_em AS ultima_mensagem_em,
           COALESCE(naolidas.total, 0) AS nao_lidas
    FROM conversas c
    JOIN conversa_participantes cp ON cp.conversa_id = c.id
    LEFT JOIN conversa_leituras cl ON cl.conversa_id = c.id AND cl.usuario_id = cp.usuario_id
    LEFT JOIN LATERAL (
      SELECT texto, criado_em
      FROM conversa_mensagens
      WHERE conversa_id = c.id
      ORDER BY criado_em DESC
      LIMIT 1
    ) ultima ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS total
      FROM conversa_mensagens
      WHERE conversa_id = c.id
        AND remetente_id != cp.usuario_id
        AND criado_em > COALESCE(cl.ultima_leitura_em, '1970-01-01 00:00:00')
    ) naolidas ON true
    WHERE cp.usuario_id = $1
  `, [usuarioId]);

  if (!conversas.length) return [];

  // Participantes (exceto você) de todas as conversas, numa única
  // consulta usando ANY($1) em vez de uma consulta por conversa.
  const idsConversas = conversas.map((c) => c.id);
  const todosOutros = await dbAll(`
    SELECT cp.conversa_id, u.id, u.nome, u.foto
    FROM conversa_participantes cp
    JOIN usuarios u ON u.id = cp.usuario_id
    WHERE cp.conversa_id = ANY($1) AND cp.usuario_id != $2
  `, [idsConversas, usuarioId]);

  const outrosPorConversa = new Map();
  for (const linha of todosOutros) {
    const lista = outrosPorConversa.get(linha.conversa_id) || [];
    lista.push({ id: linha.id, nome: linha.nome, foto: linha.foto });
    outrosPorConversa.set(linha.conversa_id, lista);
  }

  const resultado = conversas.map((c) => {
    const outros = outrosPorConversa.get(c.id) || [];
    const ehGrupo = !!c.nome;
    return {
      id: c.id,
      nome: c.nome || (outros[0] ? outros[0].nome : 'Conversa'),
      grupo: ehGrupo,
      foto: ehGrupo ? (c.foto || null) : (outros[0] ? outros[0].foto : null),
      participantes: outros,
      ultima_mensagem: c.ultima_mensagem || null,
      ultima_mensagem_em: c.ultima_mensagem_em || null,
      nao_lidas: parseInt(c.nao_lidas, 10),
      arquivada: !!c.arquivada,
      fixada: !!c.fixada
    };
  });

  return resultado.sort((a, b) => {
    if (!!b.fixada !== !!a.fixada) return (b.fixada ? 1 : 0) - (a.fixada ? 1 : 0);
    return new Date(b.ultima_mensagem_em || 0) - new Date(a.ultima_mensagem_em || 0);
  });
}

async function getMensagensConversa(conversaId) {
  return dbAll(`
    SELECT m.id, m.remetente_id, m.texto, m.criado_em, m.editado_em, u.nome AS remetente_nome
    FROM conversa_mensagens m JOIN usuarios u ON u.id = m.remetente_id
    WHERE m.conversa_id = $1 ORDER BY m.criado_em ASC
  `, [conversaId]);
}

async function enviarMensagemConversa(conversaId, remetenteId, texto) {
  await dbRun('INSERT INTO conversa_mensagens (conversa_id, remetente_id, texto) VALUES ($1, $2, $3)', [conversaId, remetenteId, texto]);
  await marcarConversaLida(conversaId, remetenteId);
}

async function editarMensagemConversa(mensagemId, remetenteId, texto) {
  const resultado = await dbRun(
    'UPDATE conversa_mensagens SET texto = $1, editado_em = CURRENT_TIMESTAMP WHERE id = $2 AND remetente_id = $3',
    [texto, mensagemId, remetenteId]
  );
  return resultado.changes > 0;
}

async function excluirMensagemConversa(mensagemId, remetenteId) {
  const resultado = await dbRun(
    'DELETE FROM conversa_mensagens WHERE id = $1 AND remetente_id = $2',
    [mensagemId, remetenteId]
  );
  return resultado.changes > 0;
}

async function marcarConversaLida(conversaId, usuarioId) {
  await dbRun(`
    INSERT INTO conversa_leituras (conversa_id, usuario_id, ultima_leitura_em)
    VALUES ($1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT(conversa_id, usuario_id) DO UPDATE SET ultima_leitura_em = CURRENT_TIMESTAMP
  `, [conversaId, usuarioId]);
}

async function arquivarConversa(conversaId, usuarioId, arquivada) {
  const resultado = await dbRun(
    'UPDATE conversa_participantes SET arquivada = $1 WHERE conversa_id = $2 AND usuario_id = $3',
    [arquivada ? 1 : 0, conversaId, usuarioId]
  );
  return resultado.changes > 0;
}

async function fixarConversa(conversaId, usuarioId, fixada) {
  const resultado = await dbRun(
    'UPDATE conversa_participantes SET fixada = $1 WHERE conversa_id = $2 AND usuario_id = $3',
    [fixada ? 1 : 0, conversaId, usuarioId]
  );
  return resultado.changes > 0;
}

async function excluirConversaParaUsuario(conversaId, usuarioId) {
  const resultado = await dbRun(
    'DELETE FROM conversa_participantes WHERE conversa_id = $1 AND usuario_id = $2',
    [conversaId, usuarioId]
  );
  return resultado.changes > 0;
}

async function removerParticipanteGrupo(conversaId, usuarioId) {
  const resultado = await dbRun(
    'DELETE FROM conversa_participantes WHERE conversa_id = $1 AND usuario_id = $2',
    [conversaId, usuarioId]
  );
  return resultado.changes > 0;
}

async function getProdutoPorId(id) {
  return dbGet('SELECT * FROM produtos WHERE id = $1', [id]);
}

async function getUsuarioComSenha(usuarioId) {
  return dbGet('SELECT id, senha FROM usuarios WHERE id = $1', [usuarioId]);
}

async function atualizarSenhaUsuario(usuarioId, senhaHash) {
  const resultado = await dbRun('UPDATE usuarios SET senha = $1 WHERE id = $2', [senhaHash, usuarioId]);
  return resultado.changes > 0;
}

async function registrarBaixaProduto(produtoId, dataFeira, sobra, quantidadeVendida) {
  const existente = await dbGet(
    'SELECT * FROM produtos_baixas WHERE produto_id = $1 AND data_feira = $2',
    [produtoId, dataFeira]
  );

  if (existente) {
    await dbRun(
      'UPDATE produtos_baixas SET quantidade_sobra = $1, quantidade_vendida = $2, atualizado_em = CURRENT_TIMESTAMP WHERE id = $3',
      [sobra, quantidadeVendida, existente.id]
    );
  } else {
    await dbRun(
      'INSERT INTO produtos_baixas (produto_id, data_feira, quantidade_sobra, quantidade_vendida) VALUES ($1, $2, $3, $4)',
      [produtoId, dataFeira, sobra, quantidadeVendida]
    );
  }

  await dbRun(
    'UPDATE produtos SET quantidade_sobra = $1, baixa_em = CURRENT_TIMESTAMP WHERE id = $2',
    [sobra, produtoId]
  );

  return { duplicado: false };
}

async function reabrirBaixaProduto(produtoId) {
  await dbRun(
    'UPDATE produtos SET quantidade_sobra = NULL, baixa_em = NULL WHERE id = $1',
    [produtoId]
  );
}

async function getResumoOfertaDemanda() {
  return dbGet(`
    SELECT
      COALESCE(SUM(quantidade_valor), 0) AS total_trazido,
      COALESCE(SUM(CASE WHEN baixa_em IS NOT NULL THEN (quantidade_valor - COALESCE(quantidade_sobra, 0)) ELSE 0 END), 0) AS total_vendido
    FROM produtos
    WHERE quantidade_valor IS NOT NULL
  `);
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
    'SELECT id FROM comentario_curtidas WHERE comentario_id = $1 AND google_id = $2',
    [comentarioId, googleId]
  );
  if (existente) {
    await dbRun('DELETE FROM comentario_curtidas WHERE id = $1', [existente.id]);
  } else {
    await dbRun('INSERT INTO comentario_curtidas (comentario_id, google_id) VALUES ($1, $2)', [comentarioId, googleId]);
  }
  const contagem = await dbGet('SELECT COUNT(*) AS total FROM comentario_curtidas WHERE comentario_id = $1', [comentarioId]);
  return { curtido: !existente, curtidas: parseInt(contagem.total, 10) };
}

async function toggleInteresseProduto(produtoId, googleId) {
  const existente = await dbGet(
    'SELECT id FROM produto_interesses WHERE produto_id = $1 AND google_id = $2',
    [produtoId, googleId]
  );
  if (existente) {
    await dbRun('DELETE FROM produto_interesses WHERE id = $1', [existente.id]);
  } else {
    await dbRun('INSERT INTO produto_interesses (produto_id, google_id) VALUES ($1, $2)', [produtoId, googleId]);
  }
  const contagem = await dbGet('SELECT COUNT(*) AS total FROM produto_interesses WHERE produto_id = $1', [produtoId]);
  return { interessado_por_mim: !existente, total: parseInt(contagem.total, 10) };
}

async function getInteresseProduto(produtoId, googleId = null) {
  const contagem = await dbGet('SELECT COUNT(*) AS total FROM produto_interesses WHERE produto_id = $1', [produtoId]);
  const interessado_por_mim = googleId
    ? !!(await dbGet('SELECT 1 FROM produto_interesses WHERE produto_id = $1 AND google_id = $2', [produtoId, googleId]))
    : false;
  return { total: parseInt(contagem.total, 10), interessado_por_mim };
}

async function criarComentarioProduto(produtoId, nomeVisitante, texto, avatarUrl, autorGoogleId) {
  await dbRun(
    'INSERT INTO comentarios_produtos (produto_id, nome_visitante, texto, avatar_url, autor_google_id) VALUES ($1, $2, $3, $4, $5)',
    [produtoId, nomeVisitante, texto, avatarUrl || null, autorGoogleId || null]
  );
}

async function getComentariosProduto(produtoId, googleId = null) {
  const comentarios = await dbAll(`
    SELECT c.id, c.nome_visitante, c.texto, c.criado_em, c.avatar_url,
      (SELECT COUNT(*) FROM comentario_curtidas WHERE comentario_id = c.id) AS curtidas
    FROM comentarios_produtos c
    WHERE c.produto_id = $1
    ORDER BY c.criado_em DESC
  `, [produtoId]);

  for (const c of comentarios) {
    c.curtido_por_mim = googleId
      ? !!(await dbGet('SELECT 1 FROM comentario_curtidas WHERE comentario_id = $1 AND google_id = $2', [c.id, googleId]))
      : false;
  }
  return comentarios;
}

async function excluirComentarioProduto(id) {
  const resultado = await dbRun('DELETE FROM comentarios_produtos WHERE id = $1', [id]);
  return resultado.changes > 0;
}

async function getComentarioComProdutor(id) {
  return dbGet(`
    SELECT c.id, c.produto_id, p.produtor_id
    FROM comentarios_produtos c
    JOIN produtos p ON p.id = c.produto_id
    WHERE c.id = $1
  `, [id]);
}

async function getProdutorPublicoPorId(id) {
  const produtor = await dbGet(
    `SELECT id, nome, foto, comunidade, whatsapp FROM usuarios WHERE id = $1 AND tipo_acesso = 'produtor'`,
    [id]
  );
  if (!produtor) return null;

  const produtos = await dbAll(
    'SELECT id, nome, categoria, imagem FROM produtos WHERE produtor_id = $1 ORDER BY nome ASC',
    [id]
  );

  for (const produto of produtos) {
    produto.comentarios = await getComentariosProduto(produto.id);
    produto.total_interesses = (await getInteresseProduto(produto.id)).total;
  }

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
  return dbGet(`
    SELECT
      COALESCE(SUM(t.quantidade), 0) AS total_tickets,
      COALESCE(SUM(t.quantidade * t.valor_unitario), 0) AS total_valor,
      COUNT(DISTINCT t.produtor_id) AS produtores_ativos
    FROM tickets t
    JOIN usuarios u ON u.id = t.produtor_id
    WHERE t.excluido_em IS NULL
  `);
}

async function getTicketsCompletos() {
  return dbAll(`
    SELECT t.id, t.produtor_id, u.nome AS produtor_nome, t.data_feira, t.quantidade, t.valor_unitario, t.criado_em, t.pago_em
    FROM tickets t
    JOIN usuarios u ON u.id = t.produtor_id
    WHERE t.excluido_em IS NULL
    ORDER BY t.criado_em DESC
  `);
}

async function getMeusTicketsCompletos(produtorId) {
  return dbAll(`
    SELECT id, produtor_id, data_feira, quantidade, valor_unitario, criado_em, pago_em
    FROM tickets
    WHERE produtor_id = $1 AND excluido_em IS NULL
    ORDER BY criado_em DESC
  `, [produtorId]);
}

async function getMeuResumoTickets(produtorId) {
  return dbGet(`
    SELECT
      COALESCE(SUM(quantidade), 0) AS total_tickets,
      COALESCE(SUM(CASE WHEN pago_em IS NULL THEN quantidade * valor_unitario ELSE 0 END), 0) AS valor_pendente,
      COALESCE(SUM(CASE WHEN pago_em IS NOT NULL THEN quantidade * valor_unitario ELSE 0 END), 0) AS total_pago
    FROM tickets
    WHERE produtor_id = $1 AND excluido_em IS NULL
  `, [produtorId]);
}

async function criarTicket(produtorId, dataFeira, quantidade, valorUnitario) {
  await dbRun(
    'INSERT INTO tickets (produtor_id, data_feira, quantidade, valor_unitario) VALUES ($1, $2, $3, $4)',
    [produtorId, dataFeira, quantidade, valorUnitario]
  );
}

async function editarTicket(id, dataFeira, quantidade, valorUnitario) {
  await dbRun(
    'UPDATE tickets SET data_feira = $1, quantidade = $2, valor_unitario = $3 WHERE id = $4',
    [dataFeira, quantidade, valorUnitario, id]
  );
}

async function getLixeiraTickets() {
  return dbAll(`
    SELECT t.id, t.produtor_id, u.nome AS produtor_nome, t.data_feira, t.quantidade, t.valor_unitario, t.excluido_em
    FROM tickets t
    JOIN usuarios u ON u.id = t.produtor_id
    WHERE t.excluido_em IS NOT NULL
    ORDER BY t.excluido_em DESC
  `);
}

async function restaurarTicketsLote(ids) {
  if (!ids.length) return;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  await dbRun(`UPDATE tickets SET excluido_em = NULL WHERE id IN (${placeholders})`, ids);
}

async function esvaziarLixeiraTickets() {
  await dbRun('DELETE FROM tickets WHERE excluido_em IS NOT NULL');
}

async function excluirTicketsLote(ids) {
  if (!ids.length) return;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  await dbRun(`UPDATE tickets SET excluido_em = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, ids);
}

async function marcarTicketsPagos(ids) {
  if (!ids.length) return;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  await dbRun(`UPDATE tickets SET pago_em = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, ids);
}

async function desmarcarTicketsPagos(ids) {
  if (!ids.length) return;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
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
      'SELECT id, nome, categoria, quantidade, quantidade_valor, unidade, quantidade_sobra, baixa_em, imagem FROM produtos WHERE produtor_id = $1 ORDER BY nome ASC',
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
  const produtor = await dbGet('SELECT id, nome, email, foto, comunidade, status FROM usuarios WHERE id = $1', [produtorId]);
  if (!produtor) return null;
  const produtos = await dbAll(
    'SELECT id, nome, categoria, quantidade, quantidade_valor, unidade, quantidade_sobra, baixa_em, imagem FROM produtos WHERE produtor_id = $1 ORDER BY nome ASC',
    [produtorId]
  );
  return { produtor, produtos };
}

async function criarProduto({ produtorId, nome, categoria, quantidadeValor, quantidade, unidade, imagem }) {
  await dbRun(
    `INSERT INTO produtos (produtor_id, nome, categoria, quantidade, quantidade_valor, unidade, imagem, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
    [produtorId, nome, categoria, quantidade || null, quantidadeValor || null, unidade || 'kg', imagem || null]
  );
}

async function editarProduto(id, { nome, categoria, quantidadeValor, quantidade, imagem }) {
  const resultado = await dbRun(
    `UPDATE produtos SET nome = $1, categoria = $2, quantidade = $3, quantidade_valor = $4, imagem = COALESCE($5, imagem) WHERE id = $6`,
    [nome, categoria, quantidade || null, quantidadeValor || null, imagem || null, id]
  );
  return resultado.changes > 0;
}

async function excluirProduto(id) {
  const resultado = await dbRun('DELETE FROM produtos WHERE id = $1', [id]);
  return resultado.changes > 0;
}

async function atualizarStatusUsuario(usuarioId, status) {
  const resultado = await dbRun('UPDATE usuarios SET status = $1 WHERE id = $2', [status, usuarioId]);
  return resultado.changes > 0;
}

async function criarProdutor({ nome, email, senhaHash, comunidade }) {
  const resultado = await dbRun(
    `INSERT INTO usuarios (nome, email, senha, comunidade, tipo_acesso, status) VALUES ($1, $2, $3, $4, 'produtor', 'ativo') RETURNING id`,
    [nome, email, senhaHash, comunidade || '']
  );
  return resultado.lastID;
}

async function editarProdutor(id, { nome, email, comunidade, foto, senhaHash }) {
  const resultado = await dbRun(
    `UPDATE usuarios SET nome = $1, email = $2, comunidade = $3, foto = COALESCE($4, foto), senha = COALESCE($5, senha) WHERE id = $6 AND tipo_acesso = 'produtor'`,
    [nome, email, comunidade, foto || null, senhaHash || null, id]
  );
  return resultado.changes > 0;
}

async function excluirProdutor(id) {
    // Antes de apagar o produtor, remove as conversas INDIVIDUAIS (1 a 1)
    // dele por inteiro. Sem isso, a conversa ficava "órfã" (só o admin
    // como participante, sem nome nem foto) e aparecia na lista de
    // mensagens como uma "Conversa" genérica e sem sentido.
    await dbRun(`
        DELETE FROM conversas
        WHERE nome IS NULL
          AND id IN (SELECT conversa_id FROM conversa_participantes WHERE usuario_id = $1)
    `, [id]);
    const resultado = await dbRun(`DELETE FROM usuarios WHERE id = $1 AND tipo_acesso = 'produtor'`, [id]);
    return resultado.changes > 0;
}

async function criarAdministrador({ nome, email, senhaHash }) {
  const resultado = await dbRun(
    `INSERT INTO usuarios (nome, email, senha, comunidade, tipo_acesso, status) VALUES ($1, $2, $3, '', 'admin', 'ativo') RETURNING id`,
    [nome, email, senhaHash]
  );
  return resultado.lastID;
}

module.exports = {
  db,
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
  initDatabase,
  getMensagensMural,
  getMapaAvatares,
  editarMensagemMural,
  excluirMensagemMural,
  getMuralNotificacoes,
  marcarMuralNotificacaoVista,
  getProdutosNotificacoes,
  marcarProdutosNotificacoesLidas,
  marcarProdutoNotificacaoVisto,
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
