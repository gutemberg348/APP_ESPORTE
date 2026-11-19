import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { Employee, Match } from "@nacional/shared/types";
import { Panel } from "./ui";
import { Text } from "./Typography";
import { Sheet } from "./Sheet";
import {
  AdminField,
  AdminFormGrid,
  AdminToggle,
  AdminNotice,
  AdminButton,
  AdminSection,
  AdminMenu,
  AdminSelect,
} from "./admin/AdminControls";
import { AdminTable, AdminBadge } from "./admin/AdminLayout";
import { Search, Plus, RefreshCw } from "lucide-react-native";
import { useTheme } from "../theme/ThemeProvider";
import { useSession } from "../providers/SessionProvider";
import { gateV1Api } from '../services/gate-v1';
import type { GateV1Match } from '@nacional/shared/gate-v1';
import { employeeApi } from "../services/gate";
import { matchDate, messageOf } from "../utils/format";
import { recoveryApi } from "../services/recovery";
import { AdminAccountForm } from "./admin/AdminAccountForm";
import { staffRoleOptions } from "../utils/staff-roles";

function physicalAssignments(employee: Employee) {
  const rows = new Map<string, { matchLabel: string; sectorName: string }>();
  for (const a of employee.assignments) if (a.active) rows.set(a.allocationId || a.sectorId, a);
  for (const a of employee.assignmentsV1) if (a.active) rows.set(a.allocationId, a);
  return [...rows.values()];
}
export function EmployeePanel({
  desktop = false,
}: {
  matches: Match[];
  desktop?: boolean;
}) {
  const { token, member } = useSession();
  const owner = member?.role === "OWNER";
  const roles = staffRoleOptions(owner);
  const { colors } = useTheme();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [gateMatches, setGateMatches] = useState<GateV1Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0);
  const [form, setForm] = useState<
    "create" | "edit" | "password" | "assignments" | null
  >(null);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Employee["role"]>("GATE"),
    [contact, setContact] = useState("");
  const [appSectors, setAppSectors] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const lock = useRef(false),
    revision = useRef(0);
  async function refresh() {
    if (!token) return;
    const current = ++revision.current;
    setLoading(true);
    try {
      const [value, matchesV1] = await Promise.all([employeeApi.list(token, query, offset), gateV1Api.matches(token, true)]);
      if (current === revision.current) { setEmployees(value); setGateMatches(matchesV1); }
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
  }, [token, query, offset]);
  function close() {
    if (lock.current) return;
    setForm(null);
    setPassword("");
    setError("");
  }
  function open(
    kind: "create" | "edit" | "password" | "assignments",
    employee: Employee | null = null,
  ) {
    setError("");
    setNotice("");
    setSelected(employee);
    setPassword("");
    setName("");
    setEmail("");
    setAppSectors(employee?.assignments.filter(item => item.active).map(item => item.sectorId) || []);
    setSectors(
      employee?.assignmentsV1
        ?.filter((item) => item.active)
        .map((item) => item.allocationId) || [],
    );
    setForm(kind);
    setName(employee?.name || "");
    setEmail(employee?.email || "");
    setRole(employee?.role || (owner ? "ADMIN" : "TICKET_SELLER"));
    setContact(employee?.contact || "");
  }
  async function perform(work: () => Promise<unknown>, message: string) {
    if (lock.current || !token) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setForm(null);
      setPassword("");
      setNotice(message);
      await refresh();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function savePassword(create: boolean) {
    if (password.length < 12 || password.length > 128) {
      setError("Use uma senha de 12 a 128 caracteres.");
      return;
    }
    if (create && (name.trim().length < 2 || !email.trim())) {
      setError("Informe nome e e-mail do funcionário.");
      return;
    }
    void perform(
      () =>
        create
          ? employeeApi.create(token!, {
              name: name.trim(),
              email: email.trim().toLowerCase(),
              password,
              role,
              contact: contact.replace(/\D/g, ""),
            })
          : employeeApi.password(token!, selected!.id, password),
      create
        ? ({
            ADMIN: "Administrador do time cadastrado. Entre em /acesso/ para cadastrar a equipe.",
            TICKET_SELLER: "Vendedor cadastrado. Use o login no app ou em /acesso/.",
            GATE: "Portaria cadastrada. O funcionário entra em /acesso/. Defina os setores em Ações → Definir escala.",
            CASHIER: "Caixa cadastrado. Autorize o acesso no cadastro do parceiro.",
          }[role])
        : "Senha redefinida e sessões anteriores revogadas.",
    );
  }
  const visible = employees;
  const actions = (employee: Employee) => (
    <AdminMenu
      disabled={busy}
      items={[
        { label: "Editar funcionário", onPress: () => open("edit", employee) },
        ...(employee.role === "GATE"
          ? [
              {
                label: "Definir escala",
                onPress: () => open("assignments", employee),
              },
            ]
          : []),
        {
          label: "Enviar recuperação por email",
          onPress: () =>
            void perform(
              () => recoveryApi.forUser(token!, employee.id),
              "Solicitação registrada. O link será enviado para o email da conta ativa.",
            ),
        },
        { label: "Redefinir senha", onPress: () => open("password", employee) },
        {
          label: employee.active ? "Desativar acesso" : "Reativar acesso",
          danger: employee.active,
          onPress: () =>
            void perform(
              () =>
                employeeApi.edit(token!, {
                  userId: employee.id,
                  active: !employee.active,
                  updatedAt: employee.updatedAt,
                }),
              employee.active
                ? "Acesso desativado e sessões encerradas."
                : "Funcionário reativado.",
            ),
        },
      ]}
    />
  );
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
        <View style={{ flexGrow: 1, flexBasis: 240 }}>
          <AdminField
            label="Buscar funcionário"
            icon={Search}
            placeholder="Nome ou e-mail"
            value={search}
            onChange={setSearch}
          />
        </View>
        <AdminButton
          primary
          label={owner ? "Cadastrar acesso" : "Novo funcionário"}
          icon={Plus}
          disabled={busy}
          onPress={() => open("create")}
        />
        <AdminButton
          label="Atualizar"
          icon={RefreshCw}
          loading={loading}
          disabled={busy}
          onPress={() => void refresh()}
        />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <AdminButton
          label="Buscar na equipe"
          loading={loading}
          disabled={busy}
          onPress={() => {
            setOffset(0);
            setQuery(search.trim());
            if (query === search.trim() && offset === 0) void refresh();
          }}
        />
        <AdminButton
          label="Página anterior"
          disabled={busy || loading || offset === 0}
          onPress={() => setOffset(Math.max(0, offset - 100))}
        />
        <AdminButton
          label="Próxima página"
          disabled={busy || loading || employees.length < 100}
          onPress={() => setOffset(offset + 100)}
        />
      </View>
      {!!notice && <AdminNotice tone="success">{notice}</AdminNotice>}
      {!!error && !form && <AdminNotice tone="error">{error}</AdminNotice>}
      {desktop ? (
        <AdminTable
          loading={loading}
          columns={[
            { label: "Funcionário", flex: 1.4 },
            { label: "Acesso", width: 120 },
            { label: "Escala", flex: 1.5 },
            { label: "Ações", width: 170 },
          ]}
          rows={visible.map((employee) => ({
            id: employee.id,
            cells: [
              <View style={{ gap: 4 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 13,
                    fontWeight: "500",
                  }}
                >
                  {employee.name}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {employee.email} ·{" "}
                  {roles.find((item) => item.value === employee.role)?.label}
                </Text>
              </View>,
              <AdminBadge
                label={employee.active ? "Ativo" : "Desativado"}
                tone={employee.active ? "success" : "neutral"}
              />,
              <Text
                style={{ color: colors.muted, fontSize: 12, lineHeight: 21 }}
              >
                {physicalAssignments(employee)
                  .map((item) => item.matchLabel + " · " + item.sectorName)
                  .join("\n") || (employee.role === "GATE" ? "Sem setores liberados" : "—")}
              </Text>,
              actions(employee),
            ],
          }))}
          empty="Nenhum funcionário encontrado."
        />
      ) : (
        <View style={{ gap: 12 }}>
          {visible.map((employee) => (
            <Panel key={employee.id} style={{ gap: 12 }}>
              <View
                style={{
                  flexDirection: "row",
                  gap: 10,
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 15,
                    fontWeight: "600",
                    flex: 1,
                  }}
                >
                  {employee.name}
                </Text>
                <AdminBadge
                  label={employee.active ? "Ativo" : "Desativado"}
                  tone={employee.active ? "success" : "neutral"}
                />
              </View>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {employee.email}
              </Text>
              <Text style={{ color: colors.subtle, fontSize: 12 }}>
                {roles.find(item => item.value === employee.role)?.label}
                {employee.role === "GATE" && ` · ${physicalAssignments(employee).length} setor(es) na escala`}
              </Text>
              {actions(employee)}
            </Panel>
          ))}
          {!loading && !visible.length && (
            <AdminNotice>
              Nenhum funcionário encontrado. Cadastre a equipe para organizar a
              portaria.
            </AdminNotice>
          )}
        </View>
      )}
      {form === "edit" && selected && (
        <AdminAccountForm
          userId={selected.id}
          onClose={close}
          onSaved={async (signedOut) => {
            setForm(null);
            setNotice("Funcionário atualizado.");
            if (!signedOut) await refresh();
          }}
        />
      )}
      {form && form !== "edit" && (
        <Sheet
          visible
          title={
            form === "create"
              ? owner ? "Cadastrar acesso" : "Novo funcionário"
              : form === "password"
                ? "Redefinir senha"
                : "Escala de portaria"
          }
          onClose={close}
        >
          {selected && (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {selected.name} · {selected.email}
            </Text>
          )}
          {form === "create" && (
            <AdminFormGrid>
              <AdminField
                label="Nome completo"
                value={name}
                onChange={setName}
                required
                editable={!busy}
              />
              <AdminField
                label="E-mail de acesso"
                value={email}
                onChange={setEmail}
                required
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!busy}
              />
            </AdminFormGrid>
          )}
          {form === "create" && (
            <>
              <AdminSelect
                label="Perfil de acesso"
                value={role}
                onChange={(v) => setRole(v as Employee["role"])}
                options={roles}
                disabled={busy}
              />
              <AdminField
                label="Telefone"
                value={contact}
                onChange={setContact}
                mask="phone"
                keyboardType="phone-pad"
                editable={!busy}
              />
              <AdminNotice>
                {role === "ADMIN" ? "Este acesso abre o painel do time em /acesso/ e permite cadastrar a equipe do clube." : roles.find(item => item.value === role)?.description}
              </AdminNotice>
            </>
          )}
          {form !== "assignments" ? (
            <>
              <AdminNotice>
                Use uma senha de pelo menos 12 caracteres. Envie as credenciais
                ao funcionário por um canal privado.
              </AdminNotice>
              <AdminFormGrid>
                <AdminField
                  label="Senha"
                  value={password}
                  onChange={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  maxLength={128}
                  editable={!busy}
                />
              </AdminFormGrid>
              <AdminButton
                primary
                label={
                  form === "create" ? (role === "ADMIN" ? "Criar administrador do time" : "Criar funcionário") : "Salvar nova senha"
                }
                loading={busy}
                onPress={() => savePassword(form === "create")}
              />
            </>
          ) : (
            <>
              <AdminNotice>
                Selecione os setores que este funcionário pode operar. Salvar
                sem marcações remove todas as liberações.
              </AdminNotice>
              {gateMatches.map((match) => (
                <AdminSection
                  key={match.id}
                  title={match.timeMandante + " × " + match.timeVisitante}
                  description={matchDate(match.dataPartida)}
                >
                  {match.alocacoesSetor.map((sector) => (
                    <AdminToggle
                      key={sector.id}
                      checkbox
                      disabled={busy}
                      label={sector.setor.nome}
                      value={match.source || sector.appOnly ? appSectors.includes(sector.id) : sectors.includes(sector.id) && (!sector.appScope || appSectors.includes(sector.appScope.alocacaoId))}
                      onChange={checked => {
                        const toggle = (ids: string[], id: string) => checked ? [...new Set([...ids, id])] : ids.filter(value => value !== id);
                        if (!match.source && !sector.appOnly) setSectors(ids => toggle(ids, sector.id));
                        const appId = match.source ? sector.id : sector.appScope?.alocacaoId;
                        if (appId) setAppSectors(ids => toggle(ids, appId));
                      }}
                    />
                  ))}
                </AdminSection>
              ))}
              <AdminButton
                primary
                label="Salvar escala"
                loading={busy}
                onPress={() =>
                  void perform(
                    () =>
                      gateV1Api.assignments(token!, selected!.id, sectors, appSectors),
                    "Escala atualizada.",
                  )
                }
              />
            </>
          )}
          {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
        </Sheet>
      )}
    </View>
  );
}
