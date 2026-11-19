import React from 'react';
import type { Match } from '@nacional/shared/types';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { matchDate } from '../utils/format';
import { ticketGateState } from '../utils/ticket-state';
import { LiveTicketQr } from './LiveTicketQr';
import { Text } from './Typography';
import { Button } from './ui';

export function TicketGateAccess({ ticketId, match, now, expanded = true, onToggle, onUsed }: {
  ticketId: string; match: Match; now: number; expanded?: boolean; onToggle?: () => void; onUsed: () => void;
}) {
  const { demoMode } = useSession();
  const { colors } = useTheme();
  if (demoMode) return null;
  const gate = ticketGateState(match, now);
  if (gate.state === 'OPEN') return <>
    {onToggle && <Button label={expanded ? 'Ocultar QR e código' : 'Apresentar QR e código na portaria'} onPress={onToggle} />}
    {expanded && <LiveTicketQr ticketId={ticketId} onUsed={onUsed} />}
  </>;
  const message = gate.state === 'CLOSED' ? 'O período de entrada desta partida foi encerrado.'
    : gate.state === 'SCHEDULED' ? `QR e código disponíveis a partir de ${matchDate(new Date(gate.opensAt).toISOString())}.`
    : 'Aguarde a liberação da portaria pelo clube.';
  return <Text style={{ color: colors.muted, fontSize: 14 }} accessibilityLiveRegion="polite">{message}</Text>;
}
