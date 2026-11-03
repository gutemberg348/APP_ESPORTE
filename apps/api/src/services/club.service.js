import { clubModel } from '../models/club.model.js';
import { AppError } from '../lib/errors.js';
export const discountedPrice = (priceCents, discountPercent) => Math.round(priceCents * (100 - discountPercent) / 100);
async function upcomingMatch(id) {
  const match = await clubModel.match(id);
  if (!match?.published) throw new AppError(404, 'MATCH_NOT_FOUND', 'Jogo não encontrado.');
  if (match.startsAt <= new Date()) throw new AppError(409, 'MATCH_STARTED', 'Este jogo já começou.');
  return match;
}
export const clubService = {
  matches: () => clubModel.matches(),
  partners: (query) => clubModel.partners(query),
  tickets: (user) => clubModel.tickets(user.id),
  quoteTicket: async (user, input) => ({ ...await clubModel.quoteTicket(user.id, input), paymentInstructions: await clubModel.paymentInstructions() }),
  requestTicket: (user, input) => clubModel.reserveTicket(user.id, input),
  async predict(user, { matchId, homeScore, awayScore }) {
    await upcomingMatch(matchId);
    if (await clubModel.prediction(user.id, matchId)) throw new AppError(409, 'PREDICTION_EXISTS', 'Seu palpite para este jogo já foi registrado.');
    return clubModel.createPrediction({ userId: user.id, matchId, homeScore, awayScore });
  },
  referral: (user, data) => clubModel.referral({ ...data, userId: user.id }),
  referrals: (user, query) => clubModel.referrals(user.id, query),
};
