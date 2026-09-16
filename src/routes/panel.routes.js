const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const {
  db,
  criarProduto,
  editarProduto,
  excluirProduto,
  atualizarStatusUsuario,
  criarProdutor,
  editarProdutor,
  excluirProdutor,
  criarAdministrador,
  getProdutoPorId,
  registrarBaixaProduto,
  reabrirBaixaProduto,
  getComentarioComProdutor,
  excluirComentarioProduto,
  getMensagensMural,
  editarMensagemMural,
  excluirMensagemMural,
  getProdutosNotificacoes,
  marcarProdutosNotificacoesLidas,
  getMuralNotificacoes,
  marcarMuralNotificacaoVista,
  getContatos,
  getOuCriarConversaIndividual,
  criarConversaGrupo,
  usuarioParticipaConversa,
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
  getUsuarioComSenha,
  atualizarSenhaUsuario,
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
  getResumoOfertaDemanda,
  getSobrasPorCategoria,
  getVolumePorProdutor,
  getProdutoresComProdutos,
  getProdutorComProdutos
} = require('../database');

const CATEGORIAS = ['Frutas', 'Verduras', 'Derivados', 'Doces & Processados'];
const { requireAuth } = require('../middlewares/auth');

// Distingue um POST vindo de fetch (JS, quer JSON de volta) de um
// formulário tradicional (quer redirect), já que a mesma rota atende as duas telas.
function querJson(req) {
  return req.is('application/json') || (req.headers.accept || '').includes('application/json');
}

// Rota principal do Painel / Dashboard
router.get('/painel', requireAuth, async (req, res) => {
    const usuario = req.currentUser;

    let mensagens = [];
    try {
        mensagens = await getMensagensMural();
    } catch (err) {
        console.error('Erro ao buscar mensagens do mural:', err);
    }

     res.render('panel/dashboard', {
        pageTitle: 'Painel de Controle',
        currentUser: usuario,
        mensagens,
        unreadCount: res.locals.unreadCount || 0
    });
});

// Lista de produtores (visão da gestora)
router.get('/painel/produtores', requireAuth, async (req, res, next) => {
    if (req.currentUser.tipo_acesso !== 'admin') return res.redirect('/painel/produtos');
    try {
        const produtores = await getProdutoresComProdutos();
        res.render('panel/produtores', {
            pageTitle: 'Produtores',
            currentUser: req.currentUser,
            produtores,
            categorias: CATEGORIAS
        });
    } catch (err) {
        next(err);
    }
});

// Meus produtos (visão do produtor)
router.get('/painel/produtos', requireAuth, async (req, res, next) => {
    if (req.currentUser.tipo_acesso === 'admin') return res.redirect('/painel/produtores');
    try {
        const dados = await getProdutorComProdutos(req.currentUser.id);
        res.render('panel/meus-produtos', {
            pageTitle: 'Meus Produtos',
            currentUser: req.currentUser,
            produtor: dados.produtor,
            produtos: dados.produtos,
            categorias: CATEGORIAS
        });
    } catch (err) {
        next(err);
    }
});

// Relatórios (visão global para a gestora, visão pessoal para o produtor)
router.get('/painel/relatorio', requireAuth, async (req, res, next) => {
    try {
        if (req.currentUser.tipo_acesso === 'admin') {
            const [resumo, ofertaDemanda, sobrasPorCategoria, produtores, ticketsCompletos, volumePorProdutor] = await Promise.all([
                getResumoTickets(),
                getResumoOfertaDemanda(),
                getSobrasPorCategoria(),
                getProdutoresParaSelect(),
                getTicketsCompletos(),
                getVolumePorProdutor()
            ]);
            const taxaAbsorcao = ofertaDemanda.total_trazido > 0
                ? (ofertaDemanda.total_vendido / ofertaDemanda.total_trazido) * 100
                : 0;
            return res.render('panel/relatorio', {
                pageTitle: 'Relatórios',
                currentUser: req.currentUser,
                visao: 'global',
                resumo,
                ofertaDemanda,
                taxaAbsorcao,
                sobrasPorCategoria,
                produtores,
                ticketsCompletos,
                volumePorProdutor
            });
        }

        const [resumo, ticketsCompletos] = await Promise.all([
            getMeuResumoTickets(req.currentUser.id),
            getMeusTicketsCompletos(req.currentUser.id)
        ]);
        res.render('panel/relatorio', {
            pageTitle: 'Relatórios',
            currentUser: req.currentUser,
            visao: 'produtor',
            resumo,
            ticketsCompletos,
            produtores: [],
            volumePorProdutor: []
        });
    } catch (err) {
        next(err);
    }
});

// Rota para publicar novo aviso no mural (Apenas Admin)
router.post('/painel/mensagens', requireAuth, async (req, res) => {
    const usuario = req.currentUser;
    const jsonResposta = querJson(req);

    if (usuario.tipo_acesso !== 'admin') {
        if (jsonResposta) return res.status(403).json({ success: false, message: 'Acesso restrito à gestora.' });
        return res.status(403).send('Acesso negado.');
    }

    const texto = (req.body.texto || '').trim();
    if (texto.length < 3) {
        if (jsonResposta) return res.status(400).json({ success: false, message: 'Escreva ao menos 3 caracteres.' });
        req.session.notice = { type: 'error', text: 'Escreva ao menos 3 caracteres.' };
        return res.redirect('/painel');
    }

     const sql = `INSERT INTO mensagens (remetente_id, texto, criado_em) VALUES ($1, $2, NOW())`;

    try {
        await db.query(sql, [usuario.id, texto]);

        if (jsonResposta) {
            const mensagens = await getMensagensMural();
            return res.json({ success: true, mensagens });
        }
        return res.redirect('/painel');
    } catch (err) {
        console.error('Erro ao salvar aviso:', err);
        if (jsonResposta) return res.status(500).json({ success: false, message: 'Erro ao salvar o aviso.' });
        req.session.notice = { type: 'error', text: 'Erro ao salvar o aviso.' };
        return res.redirect('/painel');
    }
});

// Rota para excluir aviso do mural (Apenas Admin)
router.post('/painel/mensagens/:id/excluir', requireAuth, async (req, res) => {
    const usuario = req.currentUser;

    if (usuario.tipo_acesso !== 'admin') {
        return res.status(403).json({ success: false, message: 'Acesso negado' });
    }

    try {
        await excluirMensagemMural(req.params.id);
        const mensagens = await getMensagensMural();
        res.json({ success: true, mensagens });
    } catch (err) {
        console.error('Erro ao excluir aviso:', err);
        res.status(500).json({ success: false, message: 'Erro ao deletar do banco.' });
    }
});

// Editar aviso do mural (Apenas Admin)
router.post('/painel/mensagens/:id/editar', requireAuth, async (req, res) => {
    const jsonResposta = querJson(req);
    if (req.currentUser.tipo_acesso !== 'admin') {
        if (jsonResposta) return res.status(403).json({ success: false, message: 'Acesso restrito à gestora.' });
        return res.status(403).send('Acesso negado.');
    }
    const texto = (req.body.texto || '').trim();
    if (texto.length < 3) {
        if (jsonResposta) return res.status(400).json({ success: false, message: 'Escreva ao menos 3 caracteres.' });
        req.session.notice = { type: 'error', text: 'Escreva ao menos 3 caracteres.' };
        return res.redirect('/painel');
    }
    try {
        await editarMensagemMural(req.params.id, texto);
        if (jsonResposta) {
            const mensagens = await getMensagensMural();
            return res.json({ success: true, mensagens });
        }
        return res.redirect('/painel');
    } catch (err) {
        console.error('Erro ao editar aviso:', err);
        if (jsonResposta) return res.status(500).json({ success: false, message: 'Erro ao editar o aviso.' });
        req.session.notice = { type: 'error', text: 'Erro ao editar o aviso.' };
        return res.redirect('/painel');
    }
});

// Listar avisos do mural (usado pelo modal de mensagens)
router.get('/painel/mensagens', requireAuth, async (req, res) => {
    try {
        const mensagens = await getMensagensMural();
        res.json({ success: true, mensagens });
    } catch (err) {
        console.error('Erro ao buscar mural:', err);
        res.status(500).json({ success: false, message: 'Não foi possível carregar o mural.' });
    }
});

// Notificações (novos produtos + mensagens não lidas)
router.get('/painel/notificacoes', requireAuth, async (req, res) => {
    try {
        const produtos = req.currentUser.tipo_acesso === 'admin'
            ? await getProdutosNotificacoes(req.currentUser.id)
            : [];
        const avisos = req.currentUser.tipo_acesso !== 'admin'
            ? await getMuralNotificacoes(req.currentUser.id)
            : [];
        const conversas = await getConversasDoUsuario(req.currentUser.id);
        const mensagens = conversas.filter((c) => c.nao_lidas > 0 && !c.arquivada);
        res.json({ success: true, produtos, avisos, mensagens });
    } catch (err) {
        console.error('Erro ao buscar notificações:', err);
        res.status(500).json({ success: false, message: 'Não foi possível carregar as notificações.' });
    }
});

router.post('/painel/notificacoes/produtos/ler', requireAuth, async (req, res) => {
    try {
        await marcarProdutosNotificacoesLidas(req.currentUser.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao marcar notificações como lidas:', err);
        res.status(500).json({ success: false });
    }
});

router.post('/painel/notificacoes/mural/:id/ler', requireAuth, async (req, res) => {
    try {
        await marcarMuralNotificacaoVista(req.currentUser.id, req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao marcar aviso do mural como visto:', err);
        res.status(500).json({ success: false });
    }
});

// Conversas privadas / grupos
router.get('/painel/conversas', requireAuth, async (req, res) => {
    try {
        const contatos = await getContatos(req.currentUser.id);
        const conversas = await getConversasDoUsuario(req.currentUser.id);
        res.json({ success: true, contatos, conversas });
    } catch (err) {
        console.error('Erro ao buscar conversas:', err);
        res.status(500).json({ success: false, message: 'Não foi possível carregar suas conversas.' });
    }
});

router.post('/painel/conversas/individual', requireAuth, async (req, res) => {
    const outroId = Number(req.body.usuario_id);
    if (!outroId) return res.status(400).json({ success: false, message: 'Usuário inválido.' });
    try {
        const conversaId = await getOuCriarConversaIndividual(req.currentUser.id, outroId);
        res.json({ success: true, conversa_id: conversaId });
    } catch (err) {
        console.error('Erro ao iniciar conversa:', err);
        res.status(500).json({ success: false, message: 'Não foi possível iniciar essa conversa.' });
    }
});

router.post('/painel/conversas/grupo', requireAuth, async (req, res) => {
    const nome = (req.body.nome || '').trim();
    const participantes = Array.isArray(req.body.participantes) ? req.body.participantes.map(Number) : [];
    if (!nome || participantes.length < 2) {
        return res.status(400).json({ success: false, message: 'Dê um nome ao grupo e escolha ao menos 2 pessoas.' });
    }
    try {
        const idsUnicos = Array.from(new Set([...participantes, req.currentUser.id]));
        const conversaId = await criarConversaGrupo(nome, idsUnicos);
        res.json({ success: true, conversa_id: conversaId });
    } catch (err) {
        console.error('Erro ao criar grupo:', err);
        res.status(500).json({ success: false, message: 'Não foi possível criar o grupo.' });
    }
});

router.get('/painel/conversas/:id/mensagens', requireAuth, async (req, res) => {
    const conversaId = Number(req.params.id);
    try {
        const participa = await usuarioParticipaConversa(conversaId, req.currentUser.id);
        if (!participa) return res.status(403).json({ success: false, message: 'Você não participa dessa conversa.' });
        await marcarConversaLida(conversaId, req.currentUser.id);
        const mensagens = await getMensagensConversa(conversaId);
        res.json({ success: true, mensagens });
    } catch (err) {
        console.error('Erro ao buscar mensagens da conversa:', err);
        res.status(500).json({ success: false, message: 'Não foi possível abrir essa conversa.' });
    }
});

router.post('/painel/conversas/:id/mensagens', requireAuth, async (req, res) => {
    const conversaId = Number(req.params.id);
    const texto = (req.body.texto || '').trim();
    if (!texto) return res.status(400).json({ success: false, message: 'Escreva uma mensagem.' });
    try {
        const participa = await usuarioParticipaConversa(conversaId, req.currentUser.id);
        if (!participa) return res.status(403).json({ success: false, message: 'Você não participa dessa conversa.' });
        await enviarMensagemConversa(conversaId, req.currentUser.id, texto);
        const mensagens = await getMensagensConversa(conversaId);
        res.json({ success: true, mensagens });
    } catch (err) {
        console.error('Erro ao enviar mensagem:', err);
        res.status(500).json({ success: false, message: 'Não foi possível enviar a mensagem.' });
    }
});

router.post('/painel/conversas/:conversaId/mensagens/:id/editar', requireAuth, async (req, res) => {
    const texto = (req.body.texto || '').trim();
    if (!texto) return res.status(400).json({ success: false, message: 'Escreva uma mensagem.' });
    try {
        await editarMensagemConversa(req.params.id, req.currentUser.id, texto);
        const mensagens = await getMensagensConversa(req.params.conversaId);
        res.json({ success: true, mensagens });
    } catch (err) {
        console.error('Erro ao editar mensagem:', err);
        res.status(500).json({ success: false, message: 'Não foi possível salvar a edição.' });
    }
});

router.post('/painel/conversas/:conversaId/mensagens/:id/excluir', requireAuth, async (req, res) => {
    try {
        await excluirMensagemConversa(req.params.id, req.currentUser.id);
        const mensagens = await getMensagensConversa(req.params.conversaId);
        res.json({ success: true, mensagens });
    } catch (err) {
        console.error('Erro ao excluir mensagem:', err);
        res.status(500).json({ success: false, message: 'Não foi possível excluir a mensagem.' });
    }
});

router.get('/painel/conversas/:id/participantes', requireAuth, async (req, res) => {
    const conversaId = Number(req.params.id);
    try {
        const participa = await usuarioParticipaConversa(conversaId, req.currentUser.id);
        if (!participa) return res.status(403).json({ success: false, message: 'Você não participa dessa conversa.' });
        const participantes = await getParticipantesConversa(conversaId);
        res.json({ success: true, participantes });
    } catch (err) {
        console.error('Erro ao buscar participantes:', err);
        res.status(500).json({ success: false, message: 'Não foi possível carregar os participantes.' });
    }
});

router.post('/painel/conversas/:id/foto', requireAuth, async (req, res) => {
    const conversaId = Number(req.params.id);
    const foto = (req.body.foto || '').trim();
    if (!foto) return res.status(400).json({ success: false, message: 'Informe uma foto.' });
    try {
        const participa = await usuarioParticipaConversa(conversaId, req.currentUser.id);
        if (!participa) return res.status(403).json({ success: false, message: 'Você não participa dessa conversa.' });
        const alterou = await atualizarFotoConversaGrupo(conversaId, foto);
        if (!alterou) return res.status(400).json({ success: false, message: 'Só é possível trocar a foto de um grupo.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao salvar foto do grupo:', err);
        res.status(500).json({ success: false, message: 'Não foi possível salvar a foto do grupo.' });
    }
});

router.post('/painel/conversas/:id/fixar', requireAuth, async (req, res) => {
    try {
        await fixarConversa(req.params.id, req.currentUser.id, !!req.body.fixada);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao fixar conversa:', err);
        res.status(500).json({ success: false, message: 'Não foi possível fixar a conversa.' });
    }
});

router.post('/painel/conversas/:id/arquivar', requireAuth, async (req, res) => {
    try {
        await arquivarConversa(req.params.id, req.currentUser.id, !!req.body.arquivada);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao arquivar conversa:', err);
        res.status(500).json({ success: false, message: 'Não foi possível arquivar a conversa.' });
    }
});

router.post('/painel/conversas/:id/excluir-contato', requireAuth, async (req, res) => {
    const conversaId = Number(req.params.id);
    try {
        if (req.currentUser.tipo_acesso !== 'admin') {
            const participantes = await getParticipantesConversa(conversaId);
            const temAdmin = participantes.some((p) => p.id !== req.currentUser.id && p.tipo_acesso === 'admin');
            if (temAdmin) {
                return res.status(403).json({ success: false, message: 'Não é possível excluir o contato da gestora.' });
            }
        }
        await excluirConversaParaUsuario(conversaId, req.currentUser.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir contato:', err);
        res.status(500).json({ success: false, message: 'Não foi possível excluir esse contato.' });
    }
});

// Status na vitrine (ativo/invisível)
router.post('/painel/status', requireAuth, async (req, res) => {
    try {
        await atualizarStatusUsuario(req.body.usuario_id, req.body.status);
    } catch (err) {
        console.error('Erro ao atualizar status:', err);
    }
    res.redirect(req.body.voltar_para || '/painel');
});

// Produtos (criar / editar / excluir / baixa / reabrir)
router.post('/painel/produtos', requireAuth, async (req, res) => {
    const { produtor_id, nome, categoria, quantidade_valor, quantidade, imagem } = req.body;
    try {
        await criarProduto({ produtorId: produtor_id, nome, categoria, quantidadeValor: quantidade_valor, quantidade, unidade: 'kg', imagem });
    } catch (err) {
        console.error('Erro ao criar produto:', err);
    }
    res.redirect(req.currentUser.tipo_acesso === 'admin' ? '/painel/produtores' : '/painel/produtos');
});

router.post('/painel/produtos/:id/editar', requireAuth, async (req, res) => {
    const { nome, categoria, quantidade_valor, quantidade, imagem } = req.body;
    try {
        await editarProduto(req.params.id, { nome, categoria, quantidadeValor: quantidade_valor, quantidade, imagem });
    } catch (err) {
        console.error('Erro ao editar produto:', err);
    }
    res.redirect(req.currentUser.tipo_acesso === 'admin' ? '/painel/produtores' : '/painel/produtos');
});

router.post('/painel/produtos/:id/excluir', requireAuth, async (req, res) => {
    try {
        await excluirProduto(req.params.id);
    } catch (err) {
        console.error('Erro ao excluir produto:', err);
    }
    res.redirect(req.currentUser.tipo_acesso === 'admin' ? '/painel/produtores' : '/painel/produtos');
});

router.post('/painel/produtos/:id/baixa', requireAuth, async (req, res) => {
    const { modo, sobra } = req.body;
    try {
        const produto = await getProdutoPorId(req.params.id);
        if (!produto) return res.status(404).json({ success: false, message: 'Produto não encontrado.' });
        const total = produto.quantidade_valor || 0;
        const dataFeira = new Date().toISOString().slice(0, 10);
        const sobraValor = modo === 'sobra' ? (Number(sobra) || 0) : 0;
        const vendida = total - sobraValor;
        await registrarBaixaProduto(req.params.id, dataFeira, sobraValor, vendida);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao registrar baixa:', err);
        res.status(500).json({ success: false, message: 'Erro ao registrar o fechamento.' });
    }
});

router.post('/painel/produtos/:id/reabrir', requireAuth, async (req, res) => {
    try {
        await reabrirBaixaProduto(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao reabrir fechamento:', err);
        res.status(500).json({ success: false, message: 'Erro ao reabrir.' });
    }
});

// Produtores (cadastrar / editar / excluir — apenas admin)
router.post('/painel/produtores', requireAuth, async (req, res) => {
    if (req.currentUser.tipo_acesso !== 'admin') return res.status(403).send('Acesso negado.');
    const { nome, email, senha, comunidade } = req.body;
    try {
        const senhaHash = bcrypt.hashSync(senha, 10);
        await criarProdutor({ nome, email, senhaHash, comunidade });
    } catch (err) {
        console.error('Erro ao criar produtor:', err);
    }
    res.redirect('/painel/produtores');
});

router.post('/painel/produtores/:id/editar', requireAuth, async (req, res) => {
    if (req.currentUser.tipo_acesso !== 'admin') return res.status(403).send('Acesso negado.');
    const { nome, email, comunidade, foto, nova_senha } = req.body;
    try {
        const senhaHash = nova_senha && nova_senha.trim() ? bcrypt.hashSync(nova_senha.trim(), 10) : null;
        await editarProdutor(req.params.id, { nome, email, comunidade, foto, senhaHash });
    } catch (err) {
        console.error('Erro ao editar produtor:', err);
    }
    res.redirect('/painel/produtores');
});

router.post('/painel/produtores/:id/excluir', requireAuth, async (req, res) => {
    if (req.currentUser.tipo_acesso !== 'admin') return res.status(403).send('Acesso negado.');
    try {
        await excluirProdutor(req.params.id);
    } catch (err) {
        console.error('Erro ao excluir produtor:', err);
    }
    res.redirect('/painel/produtores');
});

// Administradores (apenas admin)
router.post('/painel/administradores', requireAuth, async (req, res) => {
    if (req.currentUser.tipo_acesso !== 'admin') return res.status(403).send('Acesso negado.');
    const { nome, email, senha } = req.body;
    try {
        const senhaHash = bcrypt.hashSync(senha, 10);
        await criarAdministrador({ nome, email, senhaHash });
    } catch (err) {
        console.error('Erro ao criar administrador:', err);
    }
    res.redirect('/painel');
});

// Excluir comentário de produto — só o produtor dono do produto ou a gestora (admin).
router.post('/painel/comentarios/:id/excluir', requireAuth, async (req, res) => {
    try {
        const comentario = await getComentarioComProdutor(req.params.id);
        if (!comentario) return res.status(404).json({ success: false, message: 'Comentário não encontrado.' });

        const souDono = req.currentUser.tipo_acesso === 'produtor' && comentario.produtor_id === req.currentUser.id;
        const souAdmin = req.currentUser.tipo_acesso === 'admin';
        if (!souDono && !souAdmin) {
            return res.status(403).json({ success: false, message: 'Você não pode excluir esse comentário.' });
        }

        await excluirComentarioProduto(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir comentário:', err);
        res.status(500).json({ success: false, message: 'Erro ao excluir o comentário.' });
    }
});

// Perfil e senha
router.put('/painel/perfil', requireAuth, async (req, res) => {
    const { nome, email, whatsapp, foto } = req.body;
    if (!nome || !email) {
        return res.status(400).json({ success: false, message: 'Nome e e-mail são obrigatórios.' });
    }
    const sql = `UPDATE usuarios SET nome = $1, email = $2, whatsapp = $3, foto = $4 WHERE id = $5`;
    try {
        await db.query(sql, [nome, email, whatsapp || null, foto || null, req.currentUser.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao salvar perfil:', err);
        res.status(500).json({ success: false, message: 'Não foi possível atualizar o perfil no momento.' });
    }
});

router.post('/painel/senha', requireAuth, async (req, res) => {
    const { senhaAtual, senhaNova } = req.body;
    if (!senhaNova || senhaNova.length < 6) {
        return res.status(400).json({ success: false, message: 'A nova senha deve ter ao menos 6 caracteres.' });
    }
    try {
        const usuario = await getUsuarioComSenha(req.currentUser.id);
        const senhaValida = bcrypt.compareSync(senhaAtual || '', usuario.senha || '');
        if (!senhaValida) {
            return res.status(400).json({ success: false, message: 'Senha atual incorreta.' });
        }
        const novoHash = bcrypt.hashSync(senhaNova, 10);
        await atualizarSenhaUsuario(req.currentUser.id, novoHash);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao alterar senha:', err);
        res.status(500).json({ success: false, message: 'Erro ao alterar a senha.' });
    }
});

// Lançar novo ticket (Apenas Admin)
router.post('/painel/tickets', requireAuth, async (req, res) => {
    if (req.currentUser.tipo_acesso !== 'admin') return res.status(403).send('Acesso negado.');
    const { produtor_id, data_feira, quantidade, valor_unitario } = req.body;
    try {
        await criarTicket(produtor_id, data_feira, Number(quantidade), Number(valor_unitario));
    } catch (err) {
        console.error('Erro ao lançar ticket:', err);
    }
    res.redirect('/painel/relatorio');
});

// Editar ticket (Apenas Admin)
router.post('/painel/tickets/:id/editar', requireAuth, async (req, res) => {
    if (req.currentUser.tipo_acesso !== 'admin') return res.status(403).send('Acesso negado.');
    const { data_feira, quantidade, valor_unitario } = req.body;
    try {
        await editarTicket(req.params.id, data_feira, Number(quantidade), Number(valor_unitario));
    } catch (err) {
        console.error('Erro ao editar ticket:', err);
    }
    res.redirect('/painel/relatorio');
});

// Mover tickets selecionados para a lixeira (Apenas Admin)
router.post('/painel/tickets/excluir-lote', requireAuth, async (req, res) => {
    if (req.currentUser.tipo_acesso !== 'admin') return res.status(403).send('Acesso negado.');
    const ids = Array.isArray(req.body.ids) ? req.body.ids : (req.body.ids ? [req.body.ids] : []);
    try {
        await excluirTicketsLote(ids);
    } catch (err) {
        console.error('Erro ao excluir tickets:', err);
    }
    res.redirect('/painel/relatorio');
});

// Marcar tickets selecionados como pagos (Apenas Admin)
router.post('/painel/tickets/marcar-pago', requireAuth, async (req, res) => {
    if (req.currentUser.tipo_acesso !== 'admin') return res.status(403).send('Acesso negado.');
    const ids = Array.isArray(req.body.ids) ? req.body.ids : (req.body.ids ? [req.body.ids] : []);
    try {
        await marcarTicketsPagos(ids);
    } catch (err) {
        console.error('Erro ao marcar tickets como pagos:', err);
    }
    res.redirect('/painel/relatorio');
});

// Desmarcar tickets selecionados (voltar para "a pagar") (Apenas Admin)
router.post('/painel/tickets/desmarcar-pago', requireAuth, async (req, res) => {
    if (req.currentUser.tipo_acesso !== 'admin') return res.status(403).send('Acesso negado.');
    const ids = Array.isArray(req.body.ids) ? req.body.ids : (req.body.ids ? [req.body.ids] : []);
    try {
        await desmarcarTicketsPagos(ids);
    } catch (err) {
        console.error('Erro ao desmarcar tickets como pagos:', err);
    }
    res.redirect('/painel/relatorio');
});

// Tela da lixeira (Apenas Admin)
router.get('/painel/relatorio/lixeira', requireAuth, async (req, res, next) => {
    if (req.currentUser.tipo_acesso !== 'admin') return res.redirect('/painel/relatorio');
    try {
        const lixeira = await getLixeiraTickets();
        res.render('panel/lixeira', {
            pageTitle: 'Lixeira',
            currentUser: req.currentUser,
            lixeira
        });
    } catch (err) {
        next(err);
    }
});

// Restaurar tickets da lixeira (Apenas Admin)
router.post('/painel/tickets/restaurar-lote', requireAuth, async (req, res) => {
    if (req.currentUser.tipo_acesso !== 'admin') return res.status(403).send('Acesso negado.');
    const ids = Array.isArray(req.body.ids) ? req.body.ids : (req.body.ids ? [req.body.ids] : []);
    try {
        await restaurarTicketsLote(ids);
    } catch (err) {
        console.error('Erro ao restaurar tickets:', err);
    }
    res.redirect('/painel/relatorio/lixeira');
});

// Esvaziar lixeira definitivamente (Apenas Admin)
router.post('/painel/lixeira/esvaziar', requireAuth, async (req, res) => {
    if (req.currentUser.tipo_acesso !== 'admin') return res.status(403).send('Acesso negado.');
    try {
        await esvaziarLixeiraTickets();
    } catch (err) {
        console.error('Erro ao esvaziar lixeira:', err);
    }
    res.redirect('/painel/relatorio/lixeira');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
