import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Plus, Search } from "lucide-react-native";
import type {
  FinancialSettings,
  WithdrawalRequest,
} from "@nacional/shared/finance";
import {
  AdminButton,
  AdminField,
  AdminMenu,
  AdminNotice,
  AdminSelect,
} from "./AdminControls";
import { AdminBadge, AdminTable, useDesktopAdmin } from "./AdminLayout";
import { ReportMetrics, useAdminReport } from "./AdminReportControls";
import { PayoutHistory } from "./AdminFinancePanel";
import { PayoutAttachments } from "./PayoutAttachments";
import { WithdrawalCreateForm, WithdrawalSendForm } from "./WithdrawalForms";
import { useShopAction } from "./shop/useShopAction";
import { Text } from "../Typography";
import { Sheet } from "../Sheet";
import { Panel } from "../ui";
import { withdrawalsApi } from "../../services/withdrawals";
import { financeApi } from "../../services/finance";
import { useSession } from "../../providers/SessionProvider";
import { useTheme } from "../../theme/ThemeProvider";
import { money } from "../../utils/format";
const loadSummary = (token: string) => withdrawalsApi.summary(token);
const summaryFilters = {};
const labels = {
  PENDING: "Pendente",
  SENT: "Enviado",
  CANCELED: "Cancelado",
  VOIDED: "Envio anulado",
} as const;
export function AdminWithdrawalsPanel({ refreshKey }: { refreshKey: number }) {
  const { token } = useSession(),
    { colors } = useTheme(),
    desktop = useDesktopAdmin(),
    { busy, error, run } = useShopAction();
  const [tab, setTab] = useState("Pedidos"),
    [revision, setRevision] = useState(0),
    [status, setStatus] = useState("PENDING"),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0),
    [settings, setSettings] = useState<FinancialSettings | null>(null),
    [create, setCreate] = useState(false),
    [send, setSend] = useState<WithdrawalRequest | null>(null),
    [files, setFiles] = useState<WithdrawalRequest | null>(null),
    [cancel, setCancel] = useState<WithdrawalRequest | null>(null),
    [reason, setReason] = useState(""),
    [notice, setNotice] = useState("");
  const filters = useMemo(
    () => ({ status, search: query, limit: "20", offset: String(offset) }),
    [status, query, offset],
  );
  const summary = useAdminReport(
      loadSummary,
      summaryFilters,
      refreshKey + revision,
    ),
    requests = useAdminReport(
      withdrawalsApi.list,
      filters,
      refreshKey + revision,
    );
  useEffect(() => {
    if (!token) return;
    let live = true;
    void run(async () => {
      const config = await financeApi.settings(token);
      if (live) setSettings(config);
    });
    return () => {
      live = false;
    };
  }, [token, refreshKey]);
  const reload = async () => {
    setRevision((v) => v + 1);
  };
  const actions = (row: WithdrawalRequest) => (
    <AdminMenu
      disabled={busy}
      items={[
        { label: "Comprovantes e detalhes", onPress: () => setFiles(row) },
        ...(row.status === "PENDING"
          ? [
              {
                label: "Registrar envio realizado",
                onPress: () => setSend(row),
              },
              {
                label: "Cancelar pedido",
                danger: true,
                onPress: () => {
                  setCancel(row);
                  setReason("");
                },
              },
            ]
          : []),
      ]}
    />
  );
  return (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {["Pedidos", "Envios realizados"].map((name) => (
          <AdminButton
            key={name}
            label={name}
            primary={tab === name}
            onPress={() => setTab(name)}
          />
        ))}
        <AdminButton
          label="Novo pedido de saque"
          icon={Plus}
          disabled={
            !settings ||
            !summary.data?.availableToRequestCents ||
            summary.loading
          }
          onPress={() => setCreate(true)}
        />
      </View>
      {!!notice && <AdminNotice tone="success">{notice}</AdminNotice>}
      {!!(summary.error || error || requests.error) && (
        <AdminNotice tone="error">
          {summary.error || error || requests.error}
        </AdminNotice>
      )}
      <ReportMetrics
        items={[
          {
            label: "Livre para novos pedidos",
            value: summary.data
              ? money(summary.data.availableToRequestCents)
              : "—",
          },
          {
            label: "Pedidos pendentes",
            value: summary.data ? money(summary.data.pendingCents) : "—",
            hint: `${summary.data?.pendingCount || 0} pedido(s)`,
          },
          {
            label: "Já enviado ao time",
            value: summary.data ? money(summary.data.totalSentCents) : "—",
          },
          {
            label: "Saldo do time",
            value: summary.data ? money(summary.data.outstandingCents) : "—",
          },
        ]}
      />
      <AdminNotice>
        O envio continua manual: faça a transferência no banco e registre a
        confirmação aqui. Criar um pedido compromete o valor para novos pedidos,
        sem contabilizar como dinheiro enviado.
      </AdminNotice>
      {summary.data &&
        summary.data.pendingCents > summary.data.availableCents && (
          <AdminNotice tone="warning">
            O saldo liberado caiu após os pedidos, por ajustes ou devoluções.
            Confira e cancele pedidos sem cobertura antes de confirmar novos
            envios.
          </AdminNotice>
        )}
      {tab === "Envios realizados" ? (
        <PayoutHistory refreshKey={refreshKey + revision} onSaved={reload} />
      ) : (
        <>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "flex-end",
              gap: 12,
            }}
          >
            <View style={{ flexGrow: 1, flexBasis: 220 }}>
              <AdminField
                label="Buscar pedidos"
                value={search}
                onChange={setSearch}
                icon={Search}
                maxLength={100}
                placeholder="Favorecido, observação ou referência"
                onSubmitEditing={() => {
                  setOffset(0);
                  setQuery(search.trim());
                }}
              />
            </View>
            <View style={{ width: 180 }}>
              <AdminSelect
                label="Situação"
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  setOffset(0);
                }}
                options={[
                  { value: "", label: "Todos" },
                  ...Object.entries(labels).map(([value, label]) => ({
                    value,
                    label,
                  })),
                ]}
              />
            </View>
            <AdminButton
              label="Buscar"
              loading={requests.loading}
              onPress={() => {
                setOffset(0);
                setQuery(search.trim());
                if (query === search.trim()) void reload();
              }}
            />
          </View>
          {desktop ? (
            <AdminTable
              loading={requests.loading}
              minWidth={760}
              columns={[
                { label: "Pedido / favorecido", flex: 1.7 },
                { label: "Valor", width: 115 },
                { label: "Situação", width: 115 },
                { label: "Solicitado em", width: 150 },
                { label: "", width: 80 },
              ]}
              rows={(requests.data?.items || []).map((row) => ({
                id: row.id,
                cells: [
                  <View>
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: "600",
                        fontSize: 13,
                      }}
                    >
                      {row.recipient}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      {row.actor.name} · {row._count.attachments} comprovante(s)
                    </Text>
                  </View>,
                  <Text style={{ color: colors.text }}>
                    {money(row.amountCents)}
                  </Text>,
                  <AdminBadge
                    label={labels[row.status]}
                    tone={
                      row.status === "SENT"
                        ? "success"
                        : row.status === "PENDING"
                          ? "warning"
                          : "neutral"
                    }
                  />,
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                    {new Date(row.createdAt).toLocaleString("pt-BR")}
                  </Text>,
                  actions(row),
                ],
              }))}
              empty="Nenhum pedido de saque encontrado."
            />
          ) : (
            <View style={{ gap: 12 }}>
              {(requests.data?.items || []).map((row) => (
                <Panel key={row.id} style={{ gap: 10 }}>
                  <AdminBadge
                    label={labels[row.status]}
                    tone={
                      row.status === "PENDING"
                        ? "warning"
                        : row.status === "SENT"
                          ? "success"
                          : "neutral"
                    }
                  />
                  <Text style={{ color: colors.text, fontWeight: "600" }}>
                    {row.recipient} · {money(row.amountCents)}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {new Date(row.createdAt).toLocaleString("pt-BR")} ·{" "}
                    {row._count.attachments} comprovante(s)
                  </Text>
                  {actions(row)}
                </Panel>
              ))}
              {!requests.loading && !requests.data?.items.length && (
                <AdminNotice>Nenhum pedido encontrado.</AdminNotice>
              )}
            </View>
          )}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <AdminButton
              label="Anterior"
              disabled={requests.loading || offset === 0}
              onPress={() => setOffset(Math.max(0, offset - 20))}
            />
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {requests.data?.total || 0} pedido(s)
            </Text>
            <AdminButton
              label="Próxima"
              disabled={
                requests.loading || offset + 20 >= (requests.data?.total || 0)
              }
              onPress={() => setOffset(offset + 20)}
            />
          </View>
        </>
      )}
      {create && settings && summary.data && (
        <WithdrawalCreateForm
          summary={summary.data}
          settings={settings}
          onClose={() => setCreate(false)}
          onSaved={async () => {
            setCreate(false);
            setTab("Pedidos");
            setStatus("PENDING");
            setOffset(0);
            setQuery("");
            setSearch("");
            setNotice("Pedido de saque criado.");
            await reload();
          }}
        />
      )}
      {send && summary.data && (
        <WithdrawalSendForm
          withdrawal={send}
          summary={summary.data}
          onClose={() => setSend(null)}
          onSaved={async () => {
            setSend(null);
            setTab("Envios realizados");
            setNotice("Envio registrado e saldo atualizado.");
            await reload();
          }}
        />
      )}
      {files && (
        <Sheet
          visible
          title="Detalhes do pedido"
          onClose={() => {
            setFiles(null);
            void reload();
          }}
        >
          <Text style={{ color: colors.text, fontWeight: "600" }}>
            {files.recipient} · {money(files.amountCents)}
          </Text>
          <AdminBadge label={labels[files.status]} />
          {!!files.pixKey && (
            <Text selectable style={{ color: colors.muted }}>
              Destino: {files.pixKey}
            </Text>
          )}
          {!!files.notes && (
            <Text style={{ color: colors.muted }}>{files.notes}</Text>
          )}
          {!!files.resolutionReason && (
            <AdminNotice>{files.resolutionReason}</AdminNotice>
          )}
          <PayoutAttachments
            parent={{ withdrawalId: files.id }}
            readOnly={["CANCELED", "VOIDED"].includes(files.status)}
          />
        </Sheet>
      )}
      {cancel && (
        <Sheet
          visible
          title="Cancelar pedido de saque"
          onClose={busy ? () => {} : () => setCancel(null)}
        >
          <AdminNotice>
            O pedido de {money(cancel.amountCents)} será cancelado e deixará de
            comprometer o saldo. Nenhuma transferência bancária é desfeita.
          </AdminNotice>
          <AdminField
            label="Motivo do cancelamento"
            value={reason}
            onChange={setReason}
            maxLength={500}
            multiline
          />
          {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
          <AdminButton
            variant="danger"
            label="Confirmar cancelamento"
            loading={busy}
            disabled={reason.trim().length < 5}
            onPress={() =>
              void run(async () => {
                await withdrawalsApi.cancel(
                  token!,
                  cancel.id,
                  cancel.version,
                  reason.trim(),
                );
                setCancel(null);
                setNotice("Pedido cancelado.");
                await reload();
              })
            }
          />
        </Sheet>
      )}
    </View>
  );
}
