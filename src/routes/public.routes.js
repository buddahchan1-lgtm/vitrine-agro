const express = require('express');
const router = express.Router();
const { db, getProdutorPublicoPorId, criarComentarioProduto, getComentariosProduto, toggleInteresseProduto, getInteresseProduto } = require('../database');

function querJsonPublico(req) {
  return req.is('application/json') || (req.headers.accept || '').includes('application/json');
}

function groupPublicRows(rows) {
  if (!Array.isArray(rows)) return [];
  
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.produtor_id)) {
      map.set(row.produtor_id, {
        id: row.produtor_id,
        nome: row.nome,
        comunidade: row.comunidade,
        foto: row.foto,
        produtos: []
      });
    }
    if (row.produto_nome) {
      map.get(row.produtor_id).produtos.push({
        id: row.produto_id,
        nome: row.produto_nome,
        categoria: row.categoria,
        quantidade: row.quantidade,
        imagem: row.imagem
      });
    }
  });
  return Array.from(map.values());
}

router.get('/', async (req, res, next) => {
  const query = `
    SELECT 
      u.id AS produtor_id,
      u.nome,
      u.comunidade,
      u.foto,
      p.id AS produto_id,
      p.nome AS produto_nome,
      p.categoria,
      p.quantidade,
      p.imagem
    FROM usuarios u
    LEFT JOIN produtos p ON u.id = p.produtor_id
    WHERE u.tipo_acesso = 'produtor' AND u.status = 'ativo'
    ORDER BY u.nome ASC
  `;

  try {
    const result = await db.query(query);
    const produtores = groupPublicRows(result.rows);

    // Extrai as categorias únicas dos produtos para os botões do filtro
    const categoriasSet = new Set();
    produtores.forEach(p => {
      p.produtos.forEach(prod => {
        if (prod.categoria) categoriasSet.add(prod.categoria);
      });
    });

    res.render('public/index', {
      pageTitle: 'Vitrine de Produtos',
      produtores,
      categorias: Array.from(categoriasSet)
    });
  } catch (err) {
    next(err);
  }
});

router.get('/produtor/:id', async (req, res, next) => {
  try {
    const produtor = await getProdutorPublicoPorId(Number(req.params.id));
    if (!produtor) return res.redirect('/');
    return res.render('public/produtor-publico', {
      pageTitle: produtor.nome,
      produtor,
      currentUser: req.currentUser || null
    });
  } catch (err) {
    next(err);
  }
});

// Lista de comentários de um produto, em JSON — usada pelo painel lateral.
router.get('/produtor/:produtorId/produtos/:produtoId/comentarios', async (req, res) => {
  try {
    const comentarios = await getComentariosProduto(req.params.produtoId, req.query.google_id || null);
    res.json({ success: true, comentarios });
  } catch (err) {
    console.error('Erro ao buscar comentários:', err);
    res.status(500).json({ success: false, message: 'Não foi possível carregar os comentários.' });
  }
});

// Comentário público num produto — sem login, qualquer visitante pode enviar.
router.post('/produtor/:produtorId/produtos/:produtoId/comentarios', async (req, res) => {
  const { produtorId, produtoId } = req.params;
  const nome = (req.body.nome || '').trim().slice(0, 60) || 'Visitante';
  const texto = (req.body.texto || '').trim().slice(0, 500);
  const jsonResposta = querJsonPublico(req);

  if (!texto) {
    if (jsonResposta) return res.status(400).json({ success: false, message: 'Escreva um comentário.' });
    return res.redirect('/produtor/' + produtorId);
  }

  try {
    await criarComentarioProduto(produtoId, nome, texto, req.body.avatar_url, req.body.google_id);
    if (jsonResposta) {
      const comentarios = await getComentariosProduto(produtoId);
      return res.json({ success: true, comentarios });
    }
    return res.redirect('/produtor/' + produtorId);
  } catch (err) {
    console.error('Erro ao salvar comentário:', err);
    if (jsonResposta) return res.status(500).json({ success: false, message: 'Não foi possível salvar o comentário.' });
    return res.redirect('/produtor/' + produtorId);
  }
});

// Consulta o total de interesse de um produto (e se este visitante já marcou).
router.get('/produtor/:produtorId/produtos/:produtoId/interesse', async (req, res) => {
  try {
    const dados = await getInteresseProduto(req.params.produtoId, req.query.visitante_id || null);
    res.json({ success: true, ...dados });
  } catch (err) {
    console.error('Erro ao buscar interesse:', err);
    res.status(500).json({ success: false, message: 'Não foi possível carregar o interesse.' });
  }
});

// Marca/desmarca interesse do visitante num produto — sem login, cada navegador tem seu próprio id.
router.post('/produtor/:produtorId/produtos/:produtoId/interesse', async (req, res) => {
  const visitanteId = (req.body.visitante_id || '').trim();
  if (!visitanteId) {
    return res.status(400).json({ success: false, message: 'Não foi possível identificar o visitante.' });
  }
  try {
    const resultado = await toggleInteresseProduto(req.params.produtoId, visitanteId);
    res.json({ success: true, ...resultado });
  } catch (err) {
    console.error('Erro ao marcar interesse:', err);
    res.status(500).json({ success: false, message: 'Não foi possível marcar interesse.' });
  }
});

module.exports = router;
