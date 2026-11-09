import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { ArrowUpRight, Wallet, Settings2 } from "lucide-react-native";
import type {
  FinancialSettings,
  FinancialSummary,
  ClubPayout,
} from "@nacional/shared/finance";
import { centsInput } from "@nacional/shared/forms";
import { financeApi } from "../../services/finance";
import { useSession } from "../../providers/SessionProvider";
import { useTheme } from "../../theme/ThemeProvider";
import { money } from "../../utils/format";
import { formDate, parseClubDate } from "../../utils/admin";
import { requestKey, parseAmount } from "../../utils/payments";
import { Text } from "../Typography";
import { Panel } from "../ui";
import { Sheet } from "../Sheet";
import {
  AdminButton,
  AdminField,
  AdminSelect,
  AdminToggle,
  AdminFormGrid,
  AdminSection,
  AdminNotice,
  AdminDateTimeField,
} from "./AdminControls";
import { AdminTable, AdminBadge } from "./AdminLayout";
import { ReportMetrics, useAdminReport } from "./AdminReportControls";
import { useShopAction } from "./shop/useShopAction";
const days = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const loadSummary = (token: string) => financeApi.summary(token);
const alertFilters = { limit: "1", offset: "0" };
export function AdminPayoutAlert({
  refreshKey,
  onOpen,
}: {
  refreshKey: number;
  onOpen: () => void;
}) {
  const { data } = useAdminReport(loadSummary, alertFilters, refreshKey);
  if (!data?.availableCents) return null;
  return (
    <AdminNotice tone={data.schedule.due ? "warning" : "neutral"}>
      <View style={{ gap: 9 }}>
        <Text>
          {data.schedule.due
            ? "Há repasse semanal pendente."
            : "Há saldo do time aguardando repasse."}{" "}
          Valor liberado: {money(data.availableCents)}.
        </Text>
        <AdminButton label="Conferir financeiro e repasses" onPress={onOpen} />
      </View>
    </AdminNotice>
  );
}
const percent = (bps: number) =>
  (bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
function bps(value: string) {
  if (!/^\d{1,3}([,.]\d{1,2})?$/.test(value))
    throw new Error("Informe um percentual entre 0 e 100, com até duas casas.");
  const result = Math.round(Number(value.replace(",", ".")) * 100);
  if (result > 10000)
    throw new Error("O percentual não pode ultrapassar 100%.");
  return result;
}
export function AdminFinancePanel({ refreshKey }: { refreshKey: number }) {
  const { token } = useSession(),
    { colors } = useTheme(),
    [revision, setRevision] = useState(0),
    [tab, setTab] = useState("Repasses"),
    [config, setConfig] = useState<FinancialSettings | null>(null),
    [payout, setPayout] = useState(false),
    [adopt, setAdopt] = useState(false),
    [legacyReason, setLegacyReason] = useState("");
  const filters = useMemo(() => ({ limit: "25", offset: "0" }), []),
    summary = useAdminReport(loadSummary, filters, refreshKey + revision),
    { busy, error, run } = useShopAction();
  useEffect(() => {
    if (token)
      void run(async () => setConfig(await financeApi.settings(token)));
  }, [token, refreshKey]);
  const reload = async () => {
    setRevision((value) => value + 1);
    setConfig(await financeApi.settings(token!));
  };
  const totals = summary.data;
  return (
    <View style={{ gap: 22 }}>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {["Repasses", "Por pagamento", "Configurações"].map((name) => (
          <AdminButton
            key={name}
            label={name}
            primary={tab === name}
            onPress={() => setTab(name)}
          />
        ))}
      </View>
      {!!(summary.error || error) && (
        <AdminNotice tone="error">{summary.error || error}</AdminNotice>
      )}
      {tab === "Configurações" ? (
        config ? (
          <FinanceSettingsForm
            key={config.version}
            settings={config}
            onSaved={reload}
          />
        ) : (
          <Text style={{ color: colors.muted }}>
            Consultando configurações…
          </Text>
        )
      ) : (
        <>
          <ReportMetrics
            items={[
              {
                label: "A repassar ao time",
                value: totals ? money(totals.outstandingCents) : "—",
                hint: totals
                  ? `${money(totals.availableCents)} liberados para envio`
                  : "Recebimentos menos repasses já registrados",
              },
              {
                label: "Comissão da empresa",
                value: totals ? money(totals.companyCents) : "—",
                hint: `${config ? percent(config.companyBps) : "10"}% · ${config?.commissionBase === "GROSS" ? "sobre o bruto" : "sobre o líquido após gateway"}`,
              },
              {
                label: "Taxas do gateway",
                value: totals ? money(totals.gatewayFeeCents) : "—",
                hint: totals?.pendingFeeCount
                  ? `${totals.pendingFeeCount} recebimento(s) com tarifa estimada`
                  : "Tarifas conciliadas ou informadas na conferência",
              },
              {
                label: "Já enviado ao time",
                value: totals ? money(totals.totalSentCents) : "—",
                hint: "Somente repasses manuais confirmados",
              },
            ]}
          />
          {!!totals?.availableCents && (
            <AdminNotice tone={totals.schedule.due ? "warning" : "neutral"}>
              {totals.schedule.due
                ? "Repasse da semana pendente."
                : "Há saldo disponível para o próximo repasse."}{" "}
              Enviar ao time: {money(totals.availableCents)}. Dia configurado:{" "}
              {days[config?.payoutWeekday ?? 5]}.
            </AdminNotice>
          )}
          {totals && totals.outstandingCents < 0 && (
            <AdminNotice tone="warning">
              O time recebeu {money(-totals.outstandingCents)} além do saldo
              atual, por ajustes ou devoluções posteriores. Esse valor será
              compensado nos próximos recebimentos.
            </AdminNotice>
          )}
          {!!totals?.blockedCount && (
            <AdminNotice tone="warning">
              {totals.blockedCount} recebimento(s) em revisão ou devolução.
              Valores bloqueados não são liberados para novos repasses.
            </AdminNotice>
          )}
          {!!totals?.legacyCount && (
            <Panel style={{ gap: 12 }}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {totals.legacyCount} recebimento(s) antigos, total{" "}
                {money(totals.legacyGrossCents)}, ainda sem regra financeira
                registrada. Não foram incluídos no saldo do time ou da empresa.
              </Text>
              <AdminButton
                label="Conferir e adotar regra atual nos antigos"
                disabled={busy}
                onPress={() => setAdopt(true)}
              />
            </Panel>
          )}
          {tab === "Repasses" ? (
            <>
              <Panel style={{ gap: 17 }}>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <Wallet color={colors.primary} size={24} />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 17,
                        fontWeight: "600",
                      }}
                    >
                      Repasse semanal ao time
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      Faça a transferência por fora e registre aqui depois.
                    </Text>
                  </View>
                </View>
                <AdminNotice>
                  Registrar não envia Pix nem movimenta dinheiro. O saldo
                  pendente é reduzido pelo valor do comprovante. Novas vendas e
                  estornos continuam atualizando a conta.
                </AdminNotice>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Agendado para {days[config?.payoutWeekday ?? 5]}. Último
                  envio:{" "}
                  {totals?.lastPayout
                    ? `${money(totals.lastPayout.amountCents)} em ${new Date(totals.lastPayout.transferredAt).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" })}`
                    : "nenhum registrado"}
                  .
                </Text>
                <AdminButton
                  primary
                  label="Registrar repasse já enviado"
                  icon={ArrowUpRight}
                  disabled={summary.loading || !totals?.availableCents}
                  onPress={() => setPayout(true)}
                />
              </Panel>
              <PayoutHistory
                refreshKey={refreshKey + revision}
                onSaved={reload}
              />
            </>
          ) : (
            <>
              <FinancialReceipts refreshKey={refreshKey + revision} />
              <RefundCosts refreshKey={refreshKey + revision} />
            </>
          )}
        </>
      )}
      {payout && totals && config && (
        <PayoutForm
          summary={totals}
          settings={config}
          onClose={() => setPayout(false)}
          onSaved={async () => {
            setPayout(false);
            await reload();
          }}
        />
      )}
      {adopt && (
        <Sheet
          visible
          title="Conferir recebimentos antigos"
          onClose={busy ? () => {} : () => setAdopt(false)}
        >
          <AdminNotice tone="warning">
            A regra atual será aplicada explicitamente a até 100 recebimentos
            antigos por operação. Confira o acordo com o clube antes de
            confirmar. Tarifas Asaas ainda desconhecidas permanecerão estimadas
            e fora do saldo liberado.
          </AdminNotice>
          <AdminField
            label="Motivo e conferência realizada"
            value={legacyReason}
            onChange={setLegacyReason}
            multiline
          />
          {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
          <AdminButton
            primary
            label="Confirmar adoção da regra atual"
            loading={busy}
            disabled={legacyReason.trim().length < 10}
            onPress={() =>
              void run(async () => {
                await financeApi.adoptLegacy(token!, legacyReason);
                setAdopt(false);
                await reload();
              })
            }
          />
        </Sheet>
      )}
    </View>
  );
}
function FinanceSettingsForm({
  settings,
  onSaved,
}: {
  settings: FinancialSettings;
  onSaved: () => Promise<unknown>;
}) {
  const { token } = useSession(),
    [company, setCompany] = useState(settings.companyName),
    [companyPct, setCompanyPct] = useState(percent(settings.companyBps)),
    [base, setBase] = useState(settings.commissionBase),
    [gatewayPct, setGatewayPct] = useState(percent(settings.gatewayBps)),
    [fixed, setFixed] = useState(centsInput(settings.gatewayFixedCents)),
    [weekday, setWeekday] = useState(String(settings.payoutWeekday)),
    [recipient, setRecipient] = useState(settings.clubRecipient),
    [pix, setPix] = useState(settings.clubPixKey),
    { busy, error, run } = useShopAction();
  return (
    <Panel style={{ gap: 22 }}>
      <AdminSection
        title="Divisão de cada ingresso"
        description="Novas reservas guardam esta regra. Alterar aqui não muda o acordo de uma venda já criada."
      >
        <AdminField
          label="Nome da empresa"
          value={company}
          onChange={setCompany}
        />
        <AdminFormGrid>
          <AdminField
            label="Comissão da empresa"
            prefix="%"
            value={companyPct}
            onChange={setCompanyPct}
            numeric
            grow
          />
          <AdminField
            label="Participação do time"
            prefix="%"
            value={String(
              Math.max(0, 100 - Number(companyPct.replace(",", "."))),
            ).replace(".", ",")}
            onChange={() => {}}
            editable={false}
            grow
          />
        </AdminFormGrid>
        <AdminSelect
          label="Base da comissão"
          value={base}
          onChange={(value) => setBase(value as typeof base)}
          options={[
            {
              value: "NET",
              label: "Líquido · descontar gateway antes de dividir",
              description: "Padrão: empresa 10% e time 90% do líquido.",
            },
            {
              value: "GROSS",
              label: "Bruto · comissão sobre o ingresso",
              description: "A taxa do gateway é descontada da parte do time.",
            },
          ]}
        />
      </AdminSection>
      <AdminSection
        title="Taxa prevista do gateway"
        description="Usada como previsão. Nos recebimentos Asaas, a tarifa real retornada pelo provedor prevalece; estimativas não são liberadas para repasse."
      >
        <AdminFormGrid>
          <AdminField
            label="Taxa percentual"
            prefix="%"
            value={gatewayPct}
            onChange={setGatewayPct}
            numeric
            grow
          />
          <AdminField
            label="Taxa fixa por cobrança"
            prefix="R$"
            value={fixed}
            onChange={setFixed}
            numeric
            grow
          />
        </AdminFormGrid>
        <AdminNotice>
          A taxa fixa incide uma vez por cobrança, mesmo que o pedido tenha
          vários ingressos. Recebimentos manuais permitem informar a taxa
          efetivamente paga.
        </AdminNotice>
      </AdminSection>
      <AdminSection title="Repasse semanal manual">
        <AdminSelect
          label="Dia de repasse"
          value={weekday}
          onChange={setWeekday}
          options={days.map((label, index) => ({
            value: String(index),
            label,
          }))}
        />
        <AdminField
          label="Favorecido do time"
          value={recipient}
          onChange={setRecipient}
          maxLength={200}
        />
        <AdminField
          label="Chave Pix / dados para conferência (opcional)"
          value={pix}
          onChange={setPix}
          autoCapitalize="none"
          maxLength={200}
        />
        <AdminNotice>
          Esses dados ajudam a conferir o destino. O sistema não inicia
          transferências.
        </AdminNotice>
      </AdminSection>
      {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
      <AdminButton
        primary
        icon={Settings2}
        label="Salvar configurações financeiras"
        loading={busy}
        onPress={() =>
          void run(async () => {
            await financeApi.saveSettings(token!, {
              version: settings.version,
              companyName: company,
              companyBps: bps(companyPct),
              commissionBase: base,
              gatewayBps: bps(gatewayPct),
              gatewayFixedCents: parseAmount(fixed, true),
              payoutWeekday: Number(weekday),
              clubRecipient: recipient,
              clubPixKey: pix,
            });
            await onSaved();
          })
        }
      />
    </Panel>
  );
}
function PayoutForm({
  summary,
  settings,
  onClose,
  onSaved,
}: {
  summary: FinancialSummary;
  settings: FinancialSettings;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { token } = useSession(),
    [amount, setAmount] = useState(centsInput(summary.availableCents)),
    [reference, setReference] = useState(""),
    [recipient, setRecipient] = useState(settings.clubRecipient),
    [date, setDate] = useState(formDate(new Date().toISOString())),
    [notes, setNotes] = useState(""),
    [verified, setVerified] = useState(false),
    [key] = useState(requestKey),
    { busy, error, run } = useShopAction();
  return (
    <Sheet
      visible
      title="Registrar repasse ao time"
      onClose={busy ? () => {} : onClose}
    >
      <AdminNotice tone="warning">
        Registre somente após transferir e conferir o comprovante. Saldo
        liberado agora: {money(summary.availableCents)}. Um repasse integral
        zera esse saldo, preservando o histórico e a comissão da empresa.
      </AdminNotice>
      <AdminField
        label="Valor já enviado"
        prefix="R$"
        value={amount}
        onChange={setAmount}
        numeric
      />
      <AdminField
        label="Favorecido"
        value={recipient}
        onChange={setRecipient}
      />
      {!!settings.clubPixKey && (
        <AdminNotice>
          Destino configurado para conferência: {settings.clubPixKey}
        </AdminNotice>
      )}
      <AdminField
        label="Identificador único do comprovante / transação"
        value={reference}
        onChange={setReference}
        maxLength={100}
      />
      <AdminDateTimeField
        label="Data e hora da transferência"
        value={date}
        onChange={setDate}
      />
      <AdminField
        label="Observações (opcional)"
        value={notes}
        onChange={setNotes}
        multiline
      />
      <AdminToggle
        label="Já enviei esse dinheiro e conferi o comprovante"
        value={verified}
        onChange={setVerified}
        checkbox
      />
      {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
      <AdminButton
        primary
        label="Confirmar registro do repasse"
        loading={busy}
        disabled={
          !verified ||
          reference.trim().length < 5 ||
          recipient.trim().length < 2
        }
        onPress={() =>
          void run(async () => {
            await financeApi.payout(token!, {
              amountCents: parseAmount(amount),
              expectedBalanceCents: summary.availableCents,
              reference: reference.trim(),
              recipient: recipient.trim(),
              transferredAt: parseClubDate(date),
              notes,
              transferVerified: true,
              requestKey: key,
            });
            await onSaved();
          })
        }
      />
    </Sheet>
  );
}
function PayoutHistory({
  refreshKey,
  onSaved,
}: {
  refreshKey: number;
  onSaved: () => Promise<unknown>;
}) {
  const { token } = useSession(),
    { colors } = useTheme(),
    [offset, setOffset] = useState(0),
    filters = useMemo(
      () => ({ limit: "25", offset: String(offset) }),
      [offset],
    ),
    { data, error, loading } = useAdminReport(
      financeApi.payouts,
      filters,
      refreshKey,
    ),
    [voided, setVoided] = useState<ClubPayout | null>(null),
    [reason, setReason] = useState(""),
    { busy, error: actionError, run } = useShopAction();
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: colors.text, fontWeight: "600" }}>
        Histórico de envios
      </Text>
      {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
      <AdminTable
        minWidth={800}
        loading={loading}
        columns={[
          { label: "Transferência", width: 155 },
          { label: "Valor", width: 110 },
          { label: "Favorecido / comprovante", flex: 1.5 },
          { label: "Registro", flex: 1 },
          { label: "", width: 110 },
        ]}
        rows={(data?.items || []).map((row) => ({
          id: row.id,
          cells: [
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {new Date(row.transferredAt).toLocaleString("pt-BR", {
                timeZone: "America/Fortaleza",
              })}
            </Text>,
            <Text style={{ color: colors.text }}>
              {money(row.amountCents)}
            </Text>,
            <View>
              <Text style={{ color: colors.text, fontSize: 12 }}>
                {row.recipient}
              </Text>
              <Text selectable style={{ color: colors.subtle, fontSize: 11 }}>
                {row.reference}
              </Text>
            </View>,
            <View>
              <AdminBadge
                label={row.voidedAt ? "Registro anulado" : "Confirmado"}
                tone={row.voidedAt ? "danger" : "success"}
              />
              <Text style={{ color: colors.subtle, fontSize: 11 }}>
                {row.actor?.name}
              </Text>
              {row.voidReason && (
                <Text style={{ color: colors.subtle, fontSize: 11 }}>
                  {row.voidReason}
                </Text>
              )}
            </View>,
            row.voidedAt ? null : (
              <AdminButton
                label="Corrigir registro"
                variant="ghost"
                onPress={() => {
                  setVoided(row);
                  setReason("");
                }}
              />
            ),
          ],
        }))}
        empty="Nenhum repasse registrado."
      />
      <FinancePager
        offset={offset}
        total={data?.total || 0}
        loading={loading}
        onChange={setOffset}
      />
      {voided && (
        <Sheet
          visible
          title="Anular registro incorreto"
          onClose={busy ? () => {} : () => setVoided(null)}
        >
          <AdminNotice tone="warning">
            Esta correção devolve {money(voided.amountCents)} ao saldo pendente.
            Não desfaz uma transferência bancária. Use somente se este registro
            foi lançado por engano; o histórico será preservado.
          </AdminNotice>
          <AdminField
            label="Explique o erro do lançamento"
            value={reason}
            onChange={setReason}
            multiline
          />
          {!!actionError && (
            <AdminNotice tone="error">{actionError}</AdminNotice>
          )}
          <AdminButton
            variant="danger"
            label="Confirmar correção do registro"
            loading={busy}
            disabled={reason.trim().length < 10}
            onPress={() =>
              void run(async () => {
                await financeApi.voidPayout(token!, voided.id, reason);
                setVoided(null);
                await onSaved();
              })
            }
          />
        </Sheet>
      )}
    </View>
  );
}
function FinancialReceipts({ refreshKey }: { refreshKey: number }) {
  const { colors } = useTheme(),
    [offset, setOffset] = useState(0),
    filters = useMemo(
      () => ({ limit: "25", offset: String(offset) }),
      [offset],
    ),
    { data, error, loading } = useAdminReport(
      financeApi.receipts,
      filters,
      refreshKey,
    );
  return (
    <View style={{ gap: 14 }}>
      <AdminNotice>
        Em cada linha: bruto − devolvido = gateway + empresa + time. Se uma
        devolução ocorrer após o repasse, a diferença permanece para compensar
        na próxima semana.
      </AdminNotice>
      {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
      <AdminTable
        minWidth={1080}
        loading={loading}
        columns={[
          { label: "Comprador / partida", flex: 2 },
          { label: "Bruto", width: 95 },
          { label: "Devolvido", width: 95 },
          { label: "Gateway", width: 95 },
          { label: "Empresa", width: 95 },
          { label: "Time", width: 95 },
          { label: "Conferência", width: 170 },
        ]}
        rows={(data?.items || []).map((row) => ({
          id: row.id,
          cells: [
            <View>
              <Text style={{ color: colors.text, fontSize: 12 }}>
                {row.payment?.ticket.user.name}
              </Text>
              <Text style={{ color: colors.subtle, fontSize: 11 }}>
                {row.payment?.ticket.match.homeTeam} ×{" "}
                {row.payment?.ticket.match.awayTeam}
              </Text>
              <Text selectable style={{ color: colors.subtle, fontSize: 10 }}>
                {row.payment?.ticket.id}
              </Text>
            </View>,
            ...[
              row.grossCents,
              row.refundedCents,
              row.gatewayFeeCents,
              row.companyCents,
              row.clubCents,
            ].map((value, index) => (
              <Text
                key={index}
                style={{
                  color: value < 0 ? colors.danger : colors.text,
                  fontSize: 12,
                }}
              >
                {money(value)}
              </Text>
            )),
            <View style={{ gap: 4 }}>
              <AdminBadge
                label={
                  row.blocked
                    ? "Em revisão"
                    : row.feeSource === "ESTIMATED"
                      ? "Taxa estimada"
                      : "Conciliado"
                }
                tone={
                  row.blocked
                    ? "danger"
                    : row.feeSource === "ESTIMATED"
                      ? "warning"
                      : "success"
                }
              />
              <Text style={{ color: colors.subtle, fontSize: 10 }}>
                {percent(row.policy.companyBps)}% ·{" "}
                {row.policy.commissionBase === "NET" ? "líquido" : "bruto"}
              </Text>
            </View>,
          ],
        }))}
        empty="Ainda não há recebimentos com regra financeira registrada."
      />
      <FinancePager
        offset={offset}
        total={data?.total || 0}
        loading={loading}
        onChange={setOffset}
      />
    </View>
  );
}
function RefundCosts({ refreshKey }: { refreshKey: number }) {
  const { colors } = useTheme(),
    [offset, setOffset] = useState(0),
    filters = useMemo(
      () => ({ limit: "25", offset: String(offset) }),
      [offset],
    ),
    { data, error, loading } = useAdminReport(
      financeApi.refundCosts,
      filters,
      refreshKey,
    );
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: colors.text, fontWeight: "600" }}>
        Devoluções sem emissão de ingresso
      </Text>
      <AdminNotice>
        Uma cobrança paga depois do prazo pode ser devolvida sem emitir
        ingresso. A tarifa que o gateway reteve continua sendo custo e é
        descontada do saldo do time. Esses valores também entram nos totais
        acima.
      </AdminNotice>
      {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
      <AdminTable
        minWidth={650}
        loading={loading}
        columns={[
          { label: "Pedido / cobrança", flex: 2 },
          { label: "Recebido", width: 110 },
          { label: "Devolvido", width: 110 },
          { label: "Custo retido", width: 110 },
        ]}
        rows={(data?.items || []).map((row) => ({
          id: row.id,
          cells: [
            <View>
              <Text selectable style={{ color: colors.text, fontSize: 11 }}>
                {row.intent.ticketId}
              </Text>
              <Text selectable style={{ color: colors.subtle, fontSize: 10 }}>
                {row.intent.providerReference}
              </Text>
            </View>,
            <Text style={{ color: colors.text }}>{money(row.grossCents)}</Text>,
            <Text style={{ color: colors.text }}>
              {money(row.refundedCents)}
            </Text>,
            <Text style={{ color: colors.danger }}>
              {money(row.gatewayFeeCents)}
            </Text>,
          ],
        }))}
        empty="Nenhuma cobrança devolvida sem emissão."
      />
      <FinancePager
        offset={offset}
        total={data?.total || 0}
        loading={loading}
        onChange={setOffset}
      />
    </View>
  );
}
function FinancePager({
  offset,
  total,
  loading,
  onChange,
}: {
  offset: number;
  total: number;
  loading: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <View
      style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}
    >
      <AdminButton
        label="Anterior"
        disabled={loading || !offset}
        onPress={() => onChange(Math.max(0, offset - 25))}
      />
      <AdminButton
        label="Próxima"
        disabled={loading || offset + 25 >= total}
        onPress={() => onChange(offset + 25)}
      />
    </View>
  );
}
