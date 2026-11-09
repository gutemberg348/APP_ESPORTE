import React from 'react';
import { View, Linking } from 'react-native';
import { Gift, MapPin, BadgeCheck } from 'lucide-react-native';
import type { Partner } from '@nacional/shared/types';
import { Sheet } from './Sheet';
import { Text } from './Typography';
import { Panel, Button } from './ui';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
export function PartnerSheet({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  const { colors } = useTheme();
  const { demoMode } = useSession();
  return <Sheet visible title={partner.name} onClose={onClose}>
    <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}><Gift color={colors.primary} size={28} /></View>
    <Text style={{ color: colors.muted, fontSize: 12 }}>{partner.category.toUpperCase()}</Text>
    <Text heading style={{ color: colors.gold, fontSize: 28, lineHeight: 36, fontWeight: '800' }}>{partner.discount}</Text>
    <Text style={{ color: colors.text }}>{partner.description}</Text>
    {partner.benefits?.map((offer) => <Panel key={offer.id} style={{ gap: 10 }}><Text heading style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{offer.title}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{offer.description}</Text>{!!offer.conditions && <Text style={{ color: colors.muted, fontSize: 12 }}>{offer.conditions}</Text>}{!!offer.endsAt && <Text style={{ color: colors.gold, fontSize: 12 }}>Até {new Date(offer.endsAt).toLocaleDateString('pt-BR')}</Text>}</Panel>)}
    {!!partner.website && /^https:\/\//i.test(partner.website) && <Button secondary label="Visitar site do parceiro" onPress={() => { void Linking.openURL(partner.website!).catch(() => {}); }} />}
    {!!partner.contact && /^\d{10,13}$/.test(partner.contact) && <Button secondary label="Ligar para o parceiro" onPress={() => { void Linking.openURL(`tel:${partner.contact}`).catch(() => {}); }} />}
    <Panel style={{ gap: 12 }}><BadgeCheck color={colors.primary} size={24} /><Text style={{ color: colors.text, fontWeight: '700' }}>Como aproveitar</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{partner.conditions || 'Consulte as condições com o parceiro antes de utilizar a oferta.'}</Text></Panel>
    {!!partner.location && <View style={{ flexDirection: 'row', gap: 8 }}><MapPin color={colors.muted} size={20} /><Text style={{ color: colors.muted, fontSize: 14, flex: 1 }}>{partner.location}</Text></View>}
    <Text style={{ color: colors.muted, fontSize: 14 }}>{demoMode ? 'Parceiro fictício da demonstração. Esta oferta não pode ser utilizada em estabelecimentos.' : 'Confirme a disponibilidade da oferta com o parceiro. A emissão de cupons ainda não está habilitada.'}</Text>
    <Button label="Entendi" onPress={onClose} />
  </Sheet>;
}
