import React, { useState } from "react";
import { Image, View, type StyleProp, type ImageStyle } from "react-native";
import { Package } from "lucide-react-native";
import { config } from "../../config/env";
import { useTheme } from "../../theme/ThemeProvider";
import { resolveShopImage } from "../../utils/shop-image";
export function ProductImage({
  uri,
  label,
  style,
}: {
  uri?: string;
  label: string;
  style?: StyleProp<ImageStyle>;
}) {
  const { colors } = useTheme(),
    [failed, setFailed] = useState(""),
    resolved = uri ? resolveShopImage(uri, config.apiUrl) : undefined;
  if (!resolved || failed === resolved)
    return (
      <View
        accessibilityLabel={label}
        style={[
          style,
          {
            backgroundColor: colors.soft,
            alignItems: "center",
            justifyContent: "center",
          },
        ]}
      >
        <Package size={30} color={colors.subtle} />
      </View>
    );
  return (
    <Image
      source={{ uri: resolved }}
      accessibilityLabel={label}
      style={style}
      resizeMode="contain"
      onError={() => setFailed(resolved)}
    />
  );
}
