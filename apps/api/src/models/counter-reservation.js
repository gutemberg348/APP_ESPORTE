import { serializable } from '../lib/business-rules.js';

// A counter order contains a single lot. Move its inventory and tickets together.
export async function closeCounterReservation(tx, order, status, actorId) {
  const paid = status === 'PAGO';
  const changed = await tx.pedidoIngressoV1.updateMany({ where: { id: order.id, statusPagamento: 'PENDENTE',
    ...(status === 'EXPIRADO' && { pagbankTentativa: null }) }, data: { statusPagamento: status } });
  if (!changed.count) return;
  const tickets = await tx.ingressoV1.findMany({ where: { pedidoId: order.id, status: 'RESERVADO' }, select: { loteId: true, alocacaoId: true } });
  if (!tickets.length) throw new Error('Reserva da bilheteria sem ingressos.');
  const stock = { quantidadeReservada: { decrement: tickets.length }, ...(paid && { quantidadeVendida: { increment: tickets.length } }) };
  await tx.loteIngressoPartidaV1.update({ where: { id: tickets[0].loteId }, data: stock });
  await tx.alocacaoSetorPartidaIngressoV1.update({ where: { id: tickets[0].alocacaoId }, data: { ...stock, versao: { increment: 1 } } });
  await tx.ingressoV1.updateMany({ where: { pedidoId: order.id, status: 'RESERVADO' },
    data: paid ? { status: 'VENDIDO' } : { status: 'CANCELADO', blocoEscolhido: null, fileiraEscolhida: null, assentoEscolhido: null } });
  await tx.auditLog.create({ data: { actorId: actorId || order.usuarioId, action: paid ? 'VENDA_BALCAO_CONFIRMADA' : 'RESERVA_BALCAO_ENCERRADA', entityId: order.id,
    details: { status, automatic: !actorId, method: order.metodoBalcao, amountCents: order.valorTotalCentavos, quantity: tickets.length } } });
}

export async function releaseExpiredCounterOrders(client, slug, partidaId) {
  const due = await client.pedidoIngressoV1.findMany({ where: { chaveBalcao: { not: null }, statusPagamento: 'PENDENTE', expiraEm: { lte: new Date() },
    partidaId, partida: { estadio: { tenant: { slug } } } }, select: { id: true, usuarioId: true, metodoBalcao: true, valorTotalCentavos: true } });
  for (const order of due) await serializable(client, tx => closeCounterReservation(tx, order, 'EXPIRADO', null));
}

export async function reverseCounterOrder(tx, order, status) {
  if (order.statusPagamento === 'PENDENTE') await closeCounterReservation(tx, order, 'CANCELADO', null);
  const unused = await tx.ingressoV1.findMany({ where: { pedidoId: order.id, status: 'VENDIDO' }, select: { id: true, loteId: true, alocacaoId: true } });
  if (unused.length) {
    const changed = await tx.ingressoV1.updateMany({ where: { id: { in: unused.map(t => t.id) }, status: 'VENDIDO' },
      data: { status: 'CANCELADO', blocoEscolhido: null, fileiraEscolhida: null, assentoEscolhido: null } });
    const decrement = { decrement: changed.count };
    await tx.loteIngressoPartidaV1.update({ where: { id: unused[0].loteId }, data: { quantidadeVendida: decrement } });
    await tx.alocacaoSetorPartidaIngressoV1.update({ where: { id: unused[0].alocacaoId }, data: { quantidadeVendida: decrement, versao: { increment: 1 } } });
  }
  await tx.pedidoIngressoV1.update({ where: { id: order.id }, data: { statusPagamento: status } });
}
