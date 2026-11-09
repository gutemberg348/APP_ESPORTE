import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Plus, Search } from "lucide-react-native";
import type {
  AdminPartner,
  Employee,
  PartnerBenefit,
} from "@nacional/shared/types";
import {
  AdminButton,
  AdminField,
  AdminMenu,
  AdminNotice,
  AdminSection,
  AdminSelect,
  AdminToggle,
} from "./AdminControls";
import { AdminBadge, AdminTable } from "./AdminLayout";
import { Text } from "../Typography";
import { Sheet } from "../Sheet";
import { useTheme } from "../../theme/ThemeProvider";
import { useSession } from "../../providers/SessionProvider";
import { partnersApi } from "../../services/partners";
import { employeeApi } from "../../services/gate";
import { messageOf } from "../../utils/format";
import { PartnerForm } from "./PartnerForm";
import { PartnerBenefitForm } from "./PartnerBenefitForm";
export function AdminPartnersPanel({ refreshKey }: { refreshKey: number }) {
  const { token } = useSession(),
    { colors } = useTheme(),
    revision = useRef(0),
    lock = useRef(false);
  const [items, setItems] = useState<AdminPartner[]>([]),
    [staff, setStaff] = useState<Employee[]>([]),
    [total, setTotal] = useState(0),
    [offset, setOffset] = useState(0),
    [status, setStatus] = useState("all"),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [edit, setEdit] = useState<AdminPartner | null | undefined>(),
    [detailId, setDetailId] = useState(""),
    [operatorIds, setOperatorIds] = useState<string[]>([]),
    [benefit, setBenefit] = useState<PartnerBenefit | null | undefined>(),
    [archive, setArchive] = useState<AdminPartner | null>(null);
  const selected = items.find((p) => p.id === detailId);
  const [staffSearch, setStaffSearch] = useState("");
  const eligibleStaff = Array.from(
    new Map(
      [
        ...staff,
        ...(selected?.merchant?.operators.map((o) => o.user) || []),
      ].map((u) => [u.id, u]),
    ).values(),
  ).filter(
    (u) =>
      (u.active && ["CASHIER", "ADMIN"].includes(u.role)) ||
      operatorIds.includes(u.id),
  );
  async function searchStaff() {
    if (!token || lock.current) return;
    try {
      setStaff(await employeeApi.list(token, staffSearch.trim()));
    } catch (err) {
      setError(messageOf(err));
    }
  }
  async function refresh() {
    if (!token) return;
    const current = ++revision.current;
    setLoading(true);
    try {
      const [data, employees] = await Promise.all([
        partnersApi.list(token, query, status, offset),
        employeeApi.list(token),
      ]);
      if (current !== revision.current) return;
      setItems(data.items);
      setTotal(data.total);
      setStaff(employees);
      const freshDetail = data.items.find((p) => p.id === detailId);
      if (freshDetail)
        setOperatorIds(
          freshDetail.merchant?.operators
            .filter((o) => o.active)
            .map((o) => o.userId) || [],
        );
    } catch (err) {
      if (current === revision.current) setError(messageOf(err));
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    return () => {
      revision.current++;
    };
  }, [token, refreshKey, query, status, offset]);
  async function perform(work: () => Promise<unknown>, message: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
      setNotice(message);
      setArchive(null);
      await refresh();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function detail(p: AdminPartner) {
    setDetailId(p.id);
    setOperatorIds(
      p.merchant?.operators.filter((o) => o.active).map((o) => o.userId) || [],
    );
    setError("");
  }
  return (
    <View style={{ gap: 20 }}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, minWidth: 220 }}>
          <AdminField
            label="Buscar parceiro"
            value={search}
            onChange={setSearch}
            icon={Search}
            placeholder="Nome, categoria ou telefone"
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
              setOffset(0);
              setStatus(v);
            }}
            options={[
              { value: "all", label: "Todos disponíveis" },
              { value: "active", label: "Ativos" },
              { value: "inactive", label: "Inativos" },
              { value: "archived", label: "Arquivados" },
            ]}
          />
        </View>
        <AdminButton
          label="Buscar"
          disabled={loading}
          onPress={() => {
            setOffset(0);
            setQuery(search.trim());
            if (search.trim() === query && offset === 0) void refresh();
          }}
        />
        <AdminButton
          primary
          label="Novo parceiro"
          icon={Plus}
          onPress={() => setEdit(null)}
        />
      </View>
      {!!notice && <AdminNotice tone="success">{notice}</AdminNotice>}
      {!!error && !selected && <AdminNotice tone="error">{error}</AdminNotice>}
      <AdminTable
        loading={loading}
        minWidth={680}
        columns={[
          { label: "Parceiro", flex: 1.5 },
          { label: "Benefício", flex: 1.3 },
          { label: "Situação", width: 110 },
          { label: "Ações", width: 80 },
        ]}
        rows={items.map((p) => ({
          id: p.id,
          cells: [
            <View style={{ gap: 4 }}>
              <Text
                style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}
              >
                {p.name}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {p.category}
              </Text>
            </View>,
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {p.discount}
            </Text>,
            <AdminBadge
              label={
                p.archivedAt ? "Arquivado" : p.active ? "Ativo" : "Inativo"
              }
              tone={p.active ? "success" : "neutral"}
            />,
            <AdminMenu
              disabled={busy}
              items={
                p.archivedAt
                  ? [
                      {
                        label: "Restaurar cadastro",
                        onPress: () =>
                          void perform(
                            () => partnersApi.archive(token!, p, true),
                            "Parceiro restaurado como inativo. Revise o cadastro e os acessos antes de ativar.",
                          ),
                      },
                    ]
                  : [
                      { label: "Editar cadastro", onPress: () => setEdit(p) },
                      { label: "Ofertas e caixas", onPress: () => detail(p) },
                      {
                        label: "Arquivar parceiro",
                        danger: true,
                        onPress: () => setArchive(p),
                      },
                    ]
              }
            />,
          ],
        }))}
        empty="Nenhum parceiro encontrado."
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {total} parceiro(s) · página {Math.floor(offset / 20) + 1}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <AdminButton
            label="Anterior"
            disabled={loading || offset === 0}
            onPress={() => setOffset(Math.max(0, offset - 20))}
          />
          <AdminButton
            label="Próxima"
            disabled={loading || offset + 20 >= total}
            onPress={() => setOffset(offset + 20)}
          />
        </View>
      </View>
      {edit !== undefined && (
        <PartnerForm
          partner={edit}
          onClose={() => setEdit(undefined)}
          onSaved={async () => {
            setEdit(undefined);
            setNotice("Parceiro salvo.");
            await refresh();
          }}
        />
      )}
      {selected && benefit === undefined && (
        <Sheet
          visible
          title={selected.name}
          onClose={busy ? () => {} : () => setDetailId("")}
        >
          <AdminSection
            title="Ofertas para os torcedores"
            description="Cadastre benefícios com períodos de divulgação e condições claras."
          >
            <AdminButton
              label="Nova oferta"
              icon={Plus}
              onPress={() => setBenefit(null)}
            />
            {selected.benefits?.map((b) => (
              <View
                key={b.id}
                style={{
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderColor: colors.border,
                  gap: 8,
                }}
              >
                <AdminBadge
                  label={b.active ? "Ativa" : "Inativa"}
                  tone={b.active ? "success" : "neutral"}
                />
                <Text style={{ color: colors.text, fontWeight: "600" }}>
                  {b.title}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {b.description}
                </Text>
                <Text style={{ color: colors.subtle, fontSize: 11 }}>
                  {b.startsAt
                    ? new Date(b.startsAt).toLocaleString("pt-BR")
                    : "Sem início definido"}{" "}
                  ·{" "}
                  {b.endsAt
                    ? new Date(b.endsAt).toLocaleString("pt-BR")
                    : "Sem fim definido"}
                </Text>
                <AdminButton
                  label="Editar oferta"
                  onPress={() => setBenefit(b)}
                />
              </View>
            ))}
          </AdminSection>
          <AdminSection
            title="Funcionários autorizados no caixa"
            description="Autorizações valem somente para este parceiro. Remover a marcação bloqueia novas vendas imediatamente."
          >
            <AdminField
              label="Buscar funcionário para autorizar"
              value={staffSearch}
              onChange={setStaffSearch}
              maxLength={100}
              placeholder="Nome ou email"
              onSubmitEditing={() => void searchStaff()}
            />
            <AdminButton
              label="Buscar caixas e administradores"
              disabled={busy}
              onPress={() => void searchStaff()}
            />
            {eligibleStaff.map((u) => (
              <AdminToggle
                checkbox
                key={u.id}
                label={u.name}
                hint={
                  u.email +
                  (!u.active || !["CASHIER", "ADMIN"].includes(u.role)
                    ? " · sem acesso elegível; remova a autorização"
                    : "")
                }
                value={operatorIds.includes(u.id)}
                disabled={busy}
                onChange={(v) =>
                  setOperatorIds((ids) =>
                    v ? [...ids, u.id] : ids.filter((id) => id !== u.id),
                  )
                }
              />
            ))}
            {!staff.some((u) => u.active && u.role === "CASHIER") && (
              <AdminNotice>
                Cadastre funcionários com o perfil Caixa de parceiro na seção
                Funcionários.
              </AdminNotice>
            )}
            <AdminButton
              primary
              label="Salvar permissões de caixa"
              loading={busy}
              onPress={() =>
                void perform(
                  () => partnersApi.operators(token!, selected, operatorIds),
                  "Permissões atualizadas.",
                )
              }
            />
          </AdminSection>
          {!!selected.merchant && (
            <AdminNotice>
              Identificador do parceiro para configurar a conta Asaas:{" "}
              {selected.merchant.id}
            </AdminNotice>
          )}
          {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
        </Sheet>
      )}
      {selected && benefit !== undefined && (
        <PartnerBenefitForm
          partnerId={selected.id}
          benefit={benefit}
          onClose={() => setBenefit(undefined)}
          onSaved={async () => {
            setBenefit(undefined);
            await refresh();
          }}
        />
      )}
      {archive && (
        <Sheet
          visible
          title="Arquivar parceiro"
          onClose={busy ? () => {} : () => setArchive(null)}
        >
          <AdminNotice>
            Arquivar {archive.name} oculta seus benefícios e bloqueia o caixa.
            As vendas anteriores permanecem no histórico. Ao restaurar, as
            permissões precisam ser revisadas.
          </AdminNotice>
          {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
          <AdminButton
            variant="danger"
            label="Confirmar arquivamento"
            loading={busy}
            onPress={() =>
              void perform(
                () => partnersApi.archive(token!, archive),
                "Parceiro arquivado.",
              )
            }
          />
        </Sheet>
      )}
    </View>
  );
}
