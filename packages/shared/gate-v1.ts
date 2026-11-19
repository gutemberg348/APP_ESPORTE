export interface GateV1Match {
  partidaV1Id?: string | null;
  source?: 'app';
  id: string; timeMandante: string; timeVisitante: string; dataPartida: string; status: string;
  portariaAtiva: boolean; portariaAbreEm: string | null; portariaFechaEm: string | null;
  estadio: { nome: string; nomePopular: string | null };
  alocacoesSetor: { id: string; setorId: string; alocacaoV1Id?: string | null; appScope?: { partidaId: string; alocacaoId: string }; appOnly?: boolean; setor: { nome: string; portaoEntrada: string | null } }[];
}
export interface GateV1Ticket {
  id: string; nomeTitular: string | null; cpfFinal?: string | null; remainingQuantity?: number; status: string; blocoEscolhido?: number | null; fileiraEscolhida?: string | null; assentoEscolhido?: number | null;
  utilizadoEm?: string | null; catracaId?: string | null;
  partida: Pick<GateV1Match, 'id' | 'timeMandante' | 'timeVisitante' | 'dataPartida' | 'estadio'>;
  alocacao: { id: string; setor: { id: string; nome: string; portaoEntrada: string | null; localizacao?: string | null; instrucaoAcomodacao?: string | null } };
}
export interface GateV1Operation { source?: 'app'; ticketId?: string; partidaId: string; alocacaoId: string; requestKey: string; catracaId: string }
export interface GateV1Receipt { ticket: GateV1Ticket; duplicate: boolean; decision: 'ALLOW' | 'ALREADY_RECORDED'; admission: { id: string; createdAt: string; gate?: string } }
export interface GateV1History { items: { id: string; createdAt: string; gate: string | null; actor: { id: string; name: string } | null; ticket?: GateV1Ticket; reason?: string; stage?: string; partida?: Pick<GateV1Match, 'id' | 'timeMandante' | 'timeVisitante'> }[]; total: number; limit: number; offset: number }
