import { createHash } from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { assertGateUser } from '../lib/gate-rules.js';
import { serializable } from '../lib/business-rules.js';
import { verifyTicketV1TokenSignature } from '../lib/ingresso-v1-token.js';
const error = (code, message, status = 409) => new AppError(status, code, message);
const include = { partida: { include: { estadio: { select: { nome: true, nomePopular: true, ativo: true, tenantId: true } } } }, alocacao: { include: { setor: { select: { id: true, nome: true, ativo: true, portaoEntrada: true, localizacao: true, instrucaoAcomodacao: true } } } }, pedido: true, admission: true };
function view(t) {
  return { id: t.id, nomeTitular: t.nomeTitular, codigoPortaria: t.codigoPortaria, status: t.status, blocoEscolhido: t.blocoEscolhido, fileiraEscolhida: t.fileiraEscolhida, assentoEscolhido: t.assentoEscolhido, utilizadoEm: t.utilizadoEm, catracaId: t.catracaId,
    partida: { id: t.partida.id, timeMandante: t.partida.timeMandante, timeVisitante: t.partida.timeVisitante, dataPartida: t.partida.dataPartida, estadio: { nome: t.partida.estadio.nome, nomePopular: t.partida.estadio.nomePopular } },
    alocacao: { id: t.alocacaoId, setor: t.alocacao.setor } };
}
export function createGateV1Store(db, { tenantSlug, secret, now = () => new Date() }) {
  async function actor(tx, id) { const user = await tx.user.findUnique({ where: { id } }); assertGateUser(user); return user; }
  async function scope(tx, user, input) {
    const tenant = await tx.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant?.active) throw error('TENANT_INACTIVE', 'Clube indisponível.', 403);
    const allocation = await tx.alocacaoSetorPartidaIngressoV1.findFirst({ where: { id: input.alocacaoId, partidaId: input.partidaId, partida: { estadio: { tenantId: tenant.id } } } });
    if (!allocation) throw error('GATE_SCOPE_DENIED', 'Partida ou setor não autorizado.', 403);
    if (user.role !== 'ADMIN' && !await tx.gateAssignmentV1.findFirst({ where: { userId: user.id, alocacaoId: allocation.id, active: true } })) throw error('GATE_SCOPE_DENIED', 'Você não está escalado para esta partida e setor.', 403);
  }
  function assertOpen(t) {
    const match = t.partida, instant = now();
    const open = match.portariaAbreEm || new Date(match.dataPartida.getTime() - 2 * 3600000), close = match.portariaFechaEm || new Date(match.dataPartida.getTime() + 4 * 3600000);
    if (!match.portariaAtiva || !['PUBLICADA', 'ESGOTADA'].includes(match.status) || !match.estadio.ativo || !t.alocacao.setor.ativo || instant < open || instant >= close)
      throw error('GATE_CLOSED', 'Portaria fechada para esta partida ou fora do horário autorizado.');
    if (!t.pedido || t.pedido.partidaId !== t.partidaId || t.pedido.statusPagamento !== 'PAGO') throw error('TICKET_NOT_PAID', 'Pagamento do ingresso não confirmado ou estornado.');
  }
  async function ticket(tx, input) {
    const raw = input.chaveQr.trim(); let where;
    if (raw.startsWith('INGV1.')) { verifyTicketV1TokenSignature(raw, secret); where = { chaveQr: raw }; }
    else {
      const code = raw.replace(/[\s-]/g, '').toUpperCase();
      if (!/^[A-F0-9]{16}$/.test(code)) throw error('INVALID_GATE_CODE', 'Digite o código de 16 caracteres impresso no ingresso ou leia seu QR.', 422);
      where = { codigoPortaria: code.match(/.{4}/g).join('-') };
    }
    const t = await tx.ingressoV1.findFirst({ where: { ...where, partida: { estadio: { tenant: { slug: tenantSlug } } } }, include });
    if (!t) throw error('TICKET_NOT_FOUND', 'Ingresso não encontrado.', 404);
    if (t.partidaId !== input.partidaId) throw error('WRONG_MATCH', 'O ingresso não pertence à partida selecionada.');
    if (t.alocacaoId !== input.alocacaoId) throw error('WRONG_SECTOR', 'O ingresso pertence a outro setor.');
    if (raw.startsWith('INGV1.')) {
      const c = verifyTicketV1TokenSignature(raw, secret).claims;
      if (c.mid !== t.partidaId || c.alc !== t.alocacaoId || c.blk !== (t.blocoEscolhido ?? null) || c.row !== (t.fileiraEscolhida ?? null) || c.seat !== (t.assentoEscolhido ?? null)) throw error('INVALID_TICKET_QR', 'QR adulterado ou divergente do ingresso.', 422);
    }
    return t;
  }
  const receipt = (t, row, duplicate) => ({ ticket: view(t), duplicate, decision: duplicate ? 'ALREADY_RECORDED' : 'ALLOW', admission: { id: row.id, createdAt: row.createdAt, gate: row.gate } });
  async function denial(actorId, input, err, stage) {
    await db.auditLog.create({ data: { actorId, action: 'INGRESSO_V1_VALIDACAO_RECUSADA', entityId: input.partidaId, details: { stage, gate: input.catracaId || null, code: err.code || 'UNKNOWN', alocacaoId: input.alocacaoId, credentialHash: createHash('sha256').update(input.chaveQr || '').digest('hex') } } });
  }
  return {
    async matches(actorId) {
      const user = await actor(db, actorId);
      return db.partidaIngressoV1.findMany({ where: { estadio: { tenant: { slug: tenantSlug, active: true } }, ...(user.role === 'ADMIN' ? {} : { alocacoesSetor: { some: { gateAssignments: { some: { userId: actorId, active: true } } } } }) },
        select: { id: true, timeMandante: true, timeVisitante: true, dataPartida: true, status: true, portariaAtiva: true, portariaAbreEm: true, portariaFechaEm: true, estadio: { select: { nome: true, nomePopular: true } }, alocacoesSetor: { where: user.role === 'ADMIN' ? {} : { gateAssignments: { some: { userId: actorId, active: true } } }, select: { id: true, setorId: true, setor: { select: { nome: true, portaoEntrada: true } } } } }, orderBy: { dataPartida: 'desc' }, take: 200 });
    },
    async inspect(actorId, input) {
      try { return await serializable(db, async (tx) => {
        const user = await actor(tx, actorId); await scope(tx, user, input);
        const t = await ticket(tx, input); assertOpen(t);
        if (t.status !== 'VENDIDO') throw error(t.status === 'UTILIZADO' ? 'INGRESSO_JA_UTILIZADO' : 'TICKET_NOT_VALID', t.status === 'UTILIZADO' ? 'Este ingresso já foi utilizado.' : 'Ingresso cancelado, reservado ou inválido para acesso.');
        return { ...view(t), decision: 'REVIEW', serverTime: now().toISOString() };
      }); } catch (err) { if (err instanceof AppError) await denial(actorId, input, err, 'INSPECT'); throw err; }
    },
    async admit(actorId, input) {
      try { return await serializable(db, async (tx) => {
        const user = await actor(tx, actorId); await scope(tx, user, input);
        const t = await ticket(tx, input);
        const previous = await tx.admissionV1.findUnique({ where: { actorId_requestKey: { actorId, requestKey: input.requestKey } } });
        if (previous) { if (previous.ingressoId !== t.id || previous.gate !== input.catracaId) throw error('ADMISSION_KEY_CONFLICT', 'Esta operação já foi usada para outra entrada.'); return receipt(t, previous, true); }
        assertOpen(t);
        if (t.status !== 'VENDIDO') throw error(t.status === 'UTILIZADO' ? 'INGRESSO_JA_UTILIZADO' : 'TICKET_NOT_VALID', t.status === 'UTILIZADO' ? 'Este ingresso já foi utilizado.' : 'Ingresso inválido para acesso.');
        const changed = await tx.ingressoV1.updateMany({ where: { id: t.id, status: 'VENDIDO' }, data: { status: 'UTILIZADO', utilizadoEm: now(), catracaId: input.catracaId } });
        if (changed.count !== 1) throw error('INGRESSO_JA_UTILIZADO', 'Outro operador já utilizou este ingresso.');
        assertOpen(t); // A delayed lock must not bypass the closing time.
        const row = await tx.admissionV1.create({ data: { ingressoId: t.id, actorId, requestKey: input.requestKey, gate: input.catracaId } });
        await tx.auditLog.create({ data: { actorId, action: 'INGRESSO_V1_ACESSO_LIBERADO', entityId: t.id, details: { admissionId: row.id, partidaId: input.partidaId, alocacaoId: input.alocacaoId, gate: row.gate } } });
        return receipt(await tx.ingressoV1.findUnique({ where: { id: t.id }, include }), row, false);
      }); } catch (err) { if (err instanceof AppError) await denial(actorId, input, err, 'ADMIT'); throw err; }
    },
    async receipt(actorId, input) {
      const user = await actor(db, actorId); await scope(db, user, input);
      const row = await db.admissionV1.findUnique({ where: { actorId_requestKey: { actorId, requestKey: input.requestKey } }, include: { ingresso: { include } } });
      if (!row || row.ingresso.partidaId !== input.partidaId || row.ingresso.alocacaoId !== input.alocacaoId) throw error('ADMISSION_NOT_FOUND', 'Nenhuma entrada confirmada para esta operação.', 404);
      return receipt(row.ingresso, row, true);
    },
    async history(actorId, input) {
      const user = await actor(db, actorId);
      const { limit = 30, offset = 0, from, to, partidaId, alocacaoId, actorId: operator, protocol, search, kind = 'ALLOW' } = input;
      if (kind === 'DENIED') {
        const matches = await db.partidaIngressoV1.findMany({ where: { ...(partidaId ? { id: partidaId } : {}), estadio: { tenant: { slug: tenantSlug } } }, select: { id: true, timeMandante: true, timeVisitante: true } });
        const where = { action: 'INGRESSO_V1_VALIDACAO_RECUSADA', entityId: { in: matches.map((row) => row.id) }, ...(protocol ? { id: protocol } : {}), ...(user.role === 'ADMIN' ? operator ? { actorId: operator } : {} : { actorId }), ...(alocacaoId ? { details: { path: ['alocacaoId'], equals: alocacaoId } } : {}), ...((from || to) ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}) };
        const [rows, total] = await db.$transaction([db.auditLog.findMany({ where, include: { actor: { select: { id: true, name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit, skip: offset }), db.auditLog.count({ where })]);
        return { items: rows.map((row) => ({ id: row.id, createdAt: row.createdAt, actor: row.actor, gate: row.details.gate, reason: row.details.code, stage: row.details.stage, partida: matches.find((match) => match.id === row.entityId) })), total, limit, offset };
      }
      const where = { ...(protocol ? { id: protocol } : {}), ...(user.role === 'ADMIN' ? operator ? { actorId: operator } : {} : { actorId }), ingresso: { partida: { estadio: { tenant: { slug: tenantSlug } } }, ...(partidaId ? { partidaId } : {}), ...(alocacaoId ? { alocacaoId } : {}), ...(search ? { nomeTitular: { contains: search, mode: 'insensitive' } } : {}) }, ...((from || to) ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}) };
      const [rows, total] = await db.$transaction([db.admissionV1.findMany({ where, include: { ingresso: { include }, actor: { select: { id: true, name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit, skip: offset }), db.admissionV1.count({ where })]);
      return { items: rows.map(({ ingresso, ...row }) => ({ ...row, ticket: view(ingresso) })), total, limit, offset };
    },
    assignments(actorId, { userId, allocationIds }) {
      return serializable(db, async (tx) => {
        const admin = await actor(tx, actorId); if (admin.role !== 'ADMIN') throw error('ADMIN_REQUIRED', 'Acesso administrativo necessário.', 403);
        const user = await tx.user.findFirst({ where: { id: userId, role: 'GATE', active: true } });
        if (!user) throw error('GATE_ROLE_REQUIRED', 'Selecione um funcionário ativo de portaria.', 422);
        if (await tx.alocacaoSetorPartidaIngressoV1.count({ where: { id: { in: allocationIds }, partida: { estadio: { tenant: { slug: tenantSlug } } } } }) !== allocationIds.length) throw error('INVALID_ASSIGNMENT', 'Um dos setores não pertence a este clube.', 422);
        await tx.gateAssignmentV1.updateMany({ where: { userId }, data: { active: false } });
        for (const alocacaoId of allocationIds) await tx.gateAssignmentV1.upsert({ where: { userId_alocacaoId: { userId, alocacaoId } }, update: { active: true }, create: { userId, alocacaoId } });
        await tx.auditLog.create({ data: { actorId, action: 'GATE_V1_ASSIGNMENTS_CHANGED', entityId: userId, details: { allocationIds } } });
        return { updated: true };
      });
    },
  };
}
