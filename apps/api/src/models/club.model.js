import { db } from '../config/database.js';
import { ticketModel } from './ticket.model.js';
import { partnerModel } from './partner.model.js';
export const clubModel = {
  nextMatch: async () => (await ticketModel.matches())[0] || null,
  matches: ticketModel.matches,
  match: (id) => db.match.findUnique({ where: { id }, include: { sectors: true } }),
  partners: (query) => partnerModel.publicList(query),
  tickets: ticketModel.tickets,
  reserveTicket: ticketModel.reserve,
  quoteTicket: ticketModel.quote,
  paymentInstructions: ticketModel.paymentInstructions,
  prediction: (userId, matchId) => db.prediction.findUnique({ where: { userId_matchId: { userId, matchId } } }),
  predictions: (userId) => db.prediction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
  createPrediction: (data) => db.prediction.create({ data }),
  referral: (data) => db.referral.create({ data }),
  referrals: (userId, { limit = 50, offset = 0 } = {}) => db.referral.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit, skip: offset }),
};
