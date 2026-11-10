import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Panel } from '../../ui';
import { Text } from '../../Typography';
import {
  AdminField,
  AdminFormGrid,
  AdminNotice,
  AdminSection,
  AdminSelect,
} from '../AdminControls';
import { AdminBadge } from '../AdminLayout';
import { useTheme } from '../../../theme/ThemeProvider';
import {
  ingressoV1Api,
  type IngressoEmitidoV1,
  type PartidaIngressoV1,
} from '../../../services/ingresso-v1';
import { messageOf } from '../../../utils/format';

type Props = {
  token: string;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onNotice: (value: string) => void;
  onError: (value: string) => void;
};

export function PortariaIngressoV1Panel({
  token,
  busy,
  onBusy,
  onNotice,
  onError,
}: Props) {
  const { colors } = useTheme();
  const [partidas, setPartidas] = useState<PartidaIngressoV1[]>([]);
  const [partidaId, setPartidaId] = useState('');
  const [catracaId, setCatracaId] = useState('CATRACA-01');
  const [chaveQr, setChaveQr] = useState('');
  const [inspecionado, setInspecionado] = useState<IngressoEmitidoV1 | null>(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const lista = await ingressoV1Api.partidas(token);
        setPartidas(lista);
      } catch (err) {
        onError(messageOf(err));
      }
    })();
  }, [token]);

  async function inspecionar() {
    if (!chaveQr.trim()) {
      setFormError('Informe ou escaneie o código QR do ingresso.');
      return;
    }
    onBusy(true);
    setFormError('');
    try {
      const res = await ingressoV1Api.inspecionarPortaria(token, {
        chaveQr: chaveQr.trim(),
        ...(partidaId ? { partidaId } : {}),
      });
      setInspecionado(res);
    } catch (error) {
      setInspecionado(null);
      setFormError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  async function liberar() {
    if (!inspecionado) return;
    onBusy(true);
    setFormError('');
    try {
      const atualizado = await ingressoV1Api.liberarPortaria(token, {
        chaveQr: inspecionado.chaveQr,
        ...(partidaId ? { partidaId } : {}),
        catracaId: catracaId.trim() || 'CATRACA-01',
      });
      setInspecionado(atualizado);
      onNotice(`Entrada liberada na ${atualizado.catracaId} para ${atualizado.nomeTitular}!`);
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  return (
    <View style={{ gap: 18 }}>
      <Panel style={{ borderRadius: 14, padding: 18, gap: 16 }}>
        <AdminSection title="Leitura e Validação na Catraca (Portaria V1)">
          <AdminFormGrid>
            <AdminSelect
              label="Partida (opcional)"
              value={partidaId}
              disabled={busy}
              options={[
                { value: '', label: 'Qualquer partida ativa' },
                ...partidas.map((p) => ({
                  value: p.id,
                  label: `${p.timeMandante} × ${p.timeVisitante} (${p.estadio.nomePopular || p.estadio.nome})`,
                })),
              ]}
              onChange={setPartidaId}
            />
            <AdminField
              label="Identificador da Catraca / Portão"
              value={catracaId}
              onChange={setCatracaId}
              placeholder="CATRACA-01"
              editable={!busy}
            />
            <AdminField
              label="Token QR do Ingresso (INGV1...)"
              value={chaveQr}
              onChange={setChaveQr}
              placeholder="Cole ou escaneie o token INGV1..."
              autoCapitalize="none"
              required
              editable={!busy}
            />
          </AdminFormGrid>

          {!!formError && <AdminNotice tone="error">{formError}</AdminNotice>}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              label="Consultar / Inspecionar Bilhete"
              loading={busy}
              onPress={() => void inspecionar()}
            />
          </View>
        </AdminSection>
      </Panel>

      {inspecionado && (
        <Panel
          style={{
            borderRadius: 14,
            padding: 18,
            gap: 14,
            borderColor:
              inspecionado.status === 'VENDIDO'
                ? '#16A34A'
                : inspecionado.status === 'UTILIZADO'
                  ? '#F59E0B'
                  : colors.danger,
            borderWidth: 2,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <View style={{ gap: 2 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>
                {inspecionado.nomeTitular}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {inspecionado.partida.timeMandante} × {inspecionado.partida.timeVisitante} ·{' '}
                {inspecionado.partida.estadio.nomePopular || inspecionado.partida.estadio.nome}
              </Text>
            </View>
            <AdminBadge
              label={
                inspecionado.status === 'VENDIDO'
                  ? 'APTO PARA ENTRADA'
                  : inspecionado.status === 'UTILIZADO'
                    ? `JÁ UTILIZADO (${inspecionado.catracaId || 'Catraca'})`
                    : inspecionado.status
              }
              tone={
                inspecionado.status === 'VENDIDO'
                  ? 'success'
                  : inspecionado.status === 'UTILIZADO'
                    ? 'warning'
                    : 'danger'
              }
            />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <AdminBadge label={`Setor: ${inspecionado.alocacao.setor.nome}`} tone="neutral" />
            <AdminBadge
              label={`Portão/Local: ${
                inspecionado.alocacao.setor.localizacao ||
                inspecionado.alocacao.setor.portaoEntrada ||
                'Principal'
              }`}
              tone="neutral"
            />
            {inspecionado.blocoEscolhido ? (
              <AdminBadge
                label={`Bloco ${inspecionado.blocoEscolhido} · Fileira ${inspecionado.fileiraEscolhida} · Assento ${inspecionado.assentoEscolhido}`}
                tone="warning"
              />
            ) : (
              <AdminBadge label="Assento Livre" tone="neutral" />
            )}
            <AdminBadge
              label={`Tecnologia: ${inspecionado.alocacao.setor.tipoValidacao || 'QR_CODE'}`}
              tone="neutral"
            />
          </View>

          {inspecionado.status === 'VENDIDO' && (
            <Button
              label="Confirmar e Liberar Entrada na Catraca"
              loading={busy}
              onPress={() => void liberar()}
            />
          )}
        </Panel>
      )}
    </View>
  );
}
