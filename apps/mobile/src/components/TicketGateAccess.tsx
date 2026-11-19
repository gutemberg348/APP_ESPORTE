import React from 'react';
import type { Match } from '@nacional/shared/types';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { matchDate } from '../utils/format';
import { ticketGateState } from '../utils/ticket-state';
import { LiveTicketQr } from './LiveTicketQr';
import { Text } from './Typography';
import { TicketPresentation } from './TicketPresentation';

export function TicketGateAccess({ ticketId, match, now, onUsed }: {
  ticketId: string; match: Match; now: number; onUsed: () => void;
}) {
  const { demoMode } = useSession();
  const { colors } = useTheme();
  if (demoMode) return null;
  const gate = ticketGateState(match, now);
  if (gate.state === 'OPEN') return <TicketPresentation>{display => <LiveTicketQr key={ticketId} ticketId={ticketId} onUsed={onUsed} {...display} />}</TicketPresentation>;
  const message = gate.state === 'CLOSED' ? 'O período de entrada desta partida foi encerrado.'
    : gate.state === 'SCHEDULED' ? `QR e código disponíveis a partir de ${matchDate(new Date(gate.opensAt).toISOString())}.`
    : 'Aguarde a liberação da portaria pelo clube.';
  return <Text style={{ color: colors.muted, fontSize: 14 }} accessibilityLiveRegion="polite">{message}</Text>;
}
