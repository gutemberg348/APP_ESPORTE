import brands from '@nacional/shared/brands.json';

export type ClubId = keyof typeof brands;
const selected = process.env.EXPO_PUBLIC_CLUB || 'esporte';
if (!Object.prototype.hasOwnProperty.call(brands, selected)) throw new Error(`Clube não configurado: ${selected}. Use esporte ou nacional em EXPO_PUBLIC_CLUB.`);
export const club = brands[selected as ClubId];
const crests = {
  esporte: require('../../assets/esporte-escudo.png'),
  nacional: require('../../assets/nacional-escudo.png'),
};
export const clubCrest = crests[club.id as ClubId];
