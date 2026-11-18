import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { serializable } from '../lib/business-rules.js';
import { closeCounterReservation } from '../models/counter-reservation.js';

const digest = value => createHash('sha256').update(value).digest();
export function requireTerminalKey(configured, received) {
  if (!configured || typeof received !== 'string' || !timingSafeEqual(digest(configured), digest(received))) {
    throw new AppError(403, 'TERMINAL_KEY_REQUIRED', 'Confira a chave de habilitação da maquineta.');
  }
}

export async function processTerminalCommand(db, owner, userId, command) {
  const attempt = digest(command.attempt).toString('hex');
  try {
    return await serializable(db, async tx => {
      const order = await tx.pedidoIngressoV1.findFirst({ where: { ...owner, chaveBalcao: command.key, metodoBalcao: 'PAGBANK',
        usuario: { active: true, role: { in: ['TICKET_SELLER','ADMIN'] } } }, include: { partida: { select: { status: true } } } });
      if (!order) throw new AppError(404, 'COUNTER_NOT_FOUND', 'Venda não localizada nesta conta.');
      if (order.pagbankTentativa && order.pagbankTentativa !== attempt) throw new AppError(409, 'TERMINAL_BUSY', 'Esta venda já foi assumida por outra maquineta.');

      if (command.action === 'begin') {
        if (order.statusPagamento !== 'PENDENTE') throw new AppError(409, 'TERMINAL_CLOSED', 'Esta reserva já foi encerrada.');
        if (!order.pagbankTentativa) {
          if (!order.expiraEm || order.expiraEm <= new Date() || order.partida.status !== 'PUBLICADA') throw new AppError(409, 'TERMINAL_CLOSED', 'A reserva venceu ou a partida encerrou.');
          const reference = randomBytes(5).toString('hex').toUpperCase();
          // Keep the places while the acquirer may have captured funds, including offline recovery.
          await tx.pedidoIngressoV1.update({ where: { id: order.id }, data: { pagbankTentativa: attempt, pagbankReferencia: reference, expiraEm: null } });
          order.pagbankReferencia = reference;
          await tx.auditLog.create({ data: { actorId: userId, entityId: order.id, action: 'PAGBANK_COBRANCA_INICIADA', details: { reference, amountCents: order.valorTotalCentavos } } });
        }
        return { reference: order.pagbankReferencia, amountCents: order.valorTotalCentavos };
      }
      if (!order.pagbankTentativa) throw new AppError(409, 'TERMINAL_NOT_STARTED', 'Inicie a cobrança nesta maquineta.');
      const approved = command.action === 'approved';
      if (approved && (command.reference !== order.pagbankReferencia || command.amountCents !== order.valorTotalCentavos)) {
        throw new AppError(409, 'TERMINAL_MISMATCH', 'Valor ou referência diverge da reserva.');
      }
      const target = approved ? 'PAGO' : 'CANCELADO';
      if (order.statusPagamento === target && (!approved || order.transacaoGatewayId === command.transaction)) return { status: target };
      if (order.statusPagamento !== 'PENDENTE') throw new AppError(409, 'TERMINAL_CLOSED', 'A venda já foi encerrada com outro resultado.');
      if (approved) await tx.pedidoIngressoV1.update({ where: { id: order.id }, data: { transacaoGatewayId: command.transaction } });
      await closeCounterReservation(tx, order, target, userId);
      await tx.auditLog.create({ data: { actorId: userId, entityId: order.id, action: 'PAGBANK_RESULTADO_TERMINAL',
        details: { status: target, reference: order.pagbankReferencia, ...(approved ? { transaction: command.transaction } : { reason: command.reason }) } } });
      return { status: target };
    });
  } catch (error) {
    if (error.code === 'P2002') throw new AppError(409, 'TERMINAL_REFERENCE_CONFLICT', 'Referência já registrada. Confira a operação antes de prosseguir.');
    throw error;
  }
}
