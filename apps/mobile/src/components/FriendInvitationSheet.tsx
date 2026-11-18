import React, { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Copy, Store, UserPlus } from 'lucide-react-native';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { request } from '../services/api';
import { messageOf } from '../utils/format';
import { club } from '../config/club';
import { Sheet } from './Sheet';
import { Text } from './Typography';
import { Button } from './ui';
export function InvitationSheet({ business, onClose }: { business: boolean; onClose: () => void }) {
  const Icon = business ? Store : UserPlus;
  const { token, demoMode } = useSession(), { colors } = useTheme();
  const [invitation, setInvitation] = useState<{ url: string; registrations: number } | null>(null);
  const [error, setError] = useState(''), [copied, setCopied] = useState(false), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true; setError(''); setInvitation(null);
    if (token && !demoMode) void request<{ url: string; registrations: number }>(business ? '/me/invitation?kind=business' : '/me/invitation', { token }).then(value => { if (alive) setInvitation(value); }).catch(err => { if (alive) setError(messageOf(err)); });
    return () => { alive = false; };
  }, [token, demoMode, reload, business]);
  async function perform(share: boolean) {
    if (!invitation || busy) return;
    setBusy(true); setError('');
    try {
      if (share) await Share.share({ title: `Faça parte do ${club.programName}`, message: business ? `Convite para seu comércio ser parceiro do ${club.shortName}: ${invitation.url}` : `Vem torcer comigo no ${club.programName}! Cadastre-se pelo meu convite: ${invitation.url}` });
      else { const ok = await Clipboard.setStringAsync(invitation.url); if (!ok) throw new Error('Não foi possível copiar. Selecione o link abaixo para copiar manualmente.'); setCopied(true); }
    } catch (err) { setError(messageOf(err)); } finally { setBusy(false); }
  }
  return <Sheet visible title={business ? "Indicar comércio" : "Convide um amigo"} onClose={onClose}>
    <View style={{ alignItems: 'flex-start', gap: 12 }}><Icon size={32} color={colors.primary} /><Text heading style={{ color: colors.text, fontSize: 23, fontWeight: '700' }}>{business ? 'Convide um lojista' : 'A torcida cresce com você.'}</Text></View>
    <Text style={{ color: colors.muted, fontSize: 14 }}>{business ? 'Envie o link ao lojista. Ele informa o contato do comércio e a indicação fica no seu nome.' : 'Envie seu link. Quando seu amigo criar uma conta por ele, a indicação fica registrada para você.'}</Text>
    {invitation ? <>
      <View style={{ padding: 14, borderRadius: 14, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.border, gap: 8 }}><Copy size={18} color={colors.primary} /><Text selectable style={{ color: colors.text, fontSize: 13 }}>{invitation.url}</Text></View>
      <Button label={copied ? 'Link copiado!' : 'Copiar meu link'} disabled={busy} onPress={() => void perform(false)} />
      <Button secondary label="Compartilhar convite" disabled={busy} onPress={() => void perform(true)} />
      <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, fontSize: 13 }}>{invitation.registrations} {business ? (invitation.registrations === 1 ? 'comércio indicado' : 'comércios indicados') : (invitation.registrations === 1 ? 'amigo cadastrado' : 'amigos cadastrados')} pelo seu convite.</Text>
      {!business && <Text style={{ color: colors.muted, fontSize: 12 }}>O link abre o aplicativo na web. Indicações não geram pontos ou cashback automaticamente.</Text>}
    </> : !error && <Text style={{ color: colors.muted }}>{demoMode ? 'Entre com uma conta real para gerar seu convite pessoal.' : 'Preparando seu convite…'}</Text>}
    {!!error && <><Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>{!invitation && <Button secondary label="Tentar novamente" onPress={() => setReload(value => value + 1)} />}</>}
  </Sheet>;
}
