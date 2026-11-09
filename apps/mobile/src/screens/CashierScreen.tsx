import React, { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MerchantScreen } from "./MerchantScreen";
import { SecurityScreen } from "./SecurityScreen";
import { AdminButton, AdminNotice } from "../components/admin/AdminControls";
import { AdminThemeProvider } from "../theme/AdminThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { useSession } from "../providers/SessionProvider";
import { messageOf } from "../utils/format";
export function CashierScreen() {
  return (
    <AdminThemeProvider>
      <CashierWorkspace />
    </AdminThemeProvider>
  );
}
function CashierWorkspace() {
  const { colors } = useTheme(),
    { signOut } = useSession();
  const [security, setSecurity] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{ flex: 1, width: "100%", maxWidth: 900, alignSelf: "center" }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            padding: 16,
            gap: 12,
          }}
        >
          <AdminButton
            label="Segurança da conta"
            onPress={() => setSecurity(true)}
          />
          <AdminButton
            label="Sair"
            loading={busy}
            onPress={() => {
              if (busy) return;
              setBusy(true);
              void signOut()
                .catch((err) => setError(messageOf(err)))
                .finally(() => setBusy(false));
            }}
          />
        </View>
        {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
        {security ? (
          <SecurityScreen onBack={() => setSecurity(false)} />
        ) : (
          <MerchantScreen
            onBack={() => setSecurity(true)}
            onOpenSale={() =>
              setError(
                "O QR desta venda deve ser aberto pelo cliente no app do clube.",
              )
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}
