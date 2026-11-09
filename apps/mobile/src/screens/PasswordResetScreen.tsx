import React from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PasswordRecoveryForm } from "../components/PasswordRecoveryForm";
import { Text } from "../components/Typography";
import { AdminThemeProvider } from "../theme/AdminThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
export function PasswordResetScreen(props: {
  token: string;
  portal: "APP" | "ADMIN";
  onDone: () => void;
}) {
  return (
    <AdminThemeProvider>
      <ResetPage {...props} />
    </AdminThemeProvider>
  );
}
function ResetPage(props: {
  token: string;
  portal: "APP" | "ADMIN";
  onDone: () => void;
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 440,
            gap: 24,
            padding: 24,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 16,
            backgroundColor: colors.surface,
          }}
        >
          <Text
            heading
            accessibilityRole="header"
            style={{ color: colors.text, fontSize: 26, lineHeight: 36 }}
          >
            Recuperar acesso
          </Text>
          <PasswordRecoveryForm {...props} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
