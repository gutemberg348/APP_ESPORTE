import React from "react";
import { View, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowUpRight,
  ShoppingBag,
  Search,
  Truck,
  ShieldCheck,
} from "lucide-react-native";
import type { Product, ProductPage } from "@nacional/shared/shop";
import { Text, TextInput } from "../Typography";
import { Crest } from "../Crest";
import { ProductImage } from "./ProductImage";
import { useTheme } from "../../theme/ThemeProvider";
import { money } from "../../utils/format";
export function ShopCatalog({
  catalog,
  search,
  category,
  loading,
  cartCount,
  cartTotal,
  onSearchChange,
  onSearch,
  onCategory,
  onProduct,
  onCart,
}: {
  catalog: ProductPage | null;
  search: string;
  category: string;
  loading: boolean;
  cartCount: number;
  cartTotal: number;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onCategory: (value: string) => void;
  onProduct: (product: Product) => void;
  onCart: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 22 }}>
      <LinearGradient
        colors={["#b5212c", "#68141d"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 24, borderRadius: 24, gap: 20, overflow: "hidden" }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: "#f2cf96",
            }}
          />
          <Text
            style={{
              fontSize: 10,
              color: "#fbdac7",
              letterSpacing: 1.7,
              fontWeight: "700",
            }}
          >
            LOJA DA TORCIDA
          </Text>
          <View style={{ flex: 1 }} />
          <Crest size={41} height={41} />
        </View>
        <Text
          heading
          style={{
            color: "#fff7f4",
            fontSize: 32,
            lineHeight: 39,
            fontWeight: "800",
            letterSpacing: -1,
          }}
        >
          O Esporte vai{"\n"}com você.
        </Text>
        <Text
          style={{
            color: "#f2c9c8",
            fontSize: 13,
            lineHeight: 20,
            maxWidth: 250,
          }}
        >
          Da arquibancada ao dia a dia.{"\n"}Encontre suas cores por aqui.
        </Text>
        <View style={{ height: 1, backgroundColor: "#ffffff26" }} />
        <View style={{ flexDirection: "row", gap: 18, alignItems: "center" }}>
          <ShieldCheck size={16} color="#f4d7b3" />
          <Text style={{ color: "#ffe7db", fontSize: 11, flex: 1 }}>
            Produtos e acessórios da torcida
          </Text>
          <ArrowUpRight color="#fff0e8" size={21} />
        </View>
      </LinearGradient>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 4,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 14,
          backgroundColor: colors.surface,
        }}
      >
        <Search color={colors.subtle} size={18} />
        <TextInput
          accessibilityLabel="Buscar produtos da loja"
          value={search}
          onChangeText={onSearchChange}
          onSubmitEditing={onSearch}
          returnKeyType="search"
          placeholder="O que você procura?"
          placeholderTextColor={colors.subtle}
          maxLength={100}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 43,
            color: colors.text,
            fontSize: 13,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Buscar"
          onPress={onSearch}
          style={{
            minWidth: 36,
            minHeight: 40,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ArrowUpRight size={18} color={colors.primary} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[
          { value: "", label: "Todos" },
          ...(catalog?.categories || []).map((value) => ({
            value,
            label: value,
          })),
        ].map((item) => (
          <Pressable
            key={item.value}
            accessibilityRole="button"
            accessibilityState={{ selected: category === item.value }}
            onPress={() => onCategory(item.value)}
            style={{
              paddingHorizontal: 15,
              paddingVertical: 8,
              minHeight: 37,
              justifyContent: "center",
              borderWidth: 1,
              borderColor:
                category === item.value ? colors.primary : colors.border,
              borderRadius: 20,
              backgroundColor:
                category === item.value ? colors.primarySoft : colors.surface,
            }}
          >
            <Text
              style={{
                color: category === item.value ? colors.primary : colors.muted,
                fontSize: 12,
                fontWeight: category === item.value ? "700" : "400",
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12 }}>
        <Text
          heading
          style={{
            color: colors.text,
            fontSize: 20,
            fontWeight: "700",
            flex: 1,
          }}
        >
          Feitos para torcer
        </Text>
        <Text style={{ color: colors.subtle, fontSize: 11 }}>
          {catalog?.total || 0} produtos
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {(catalog?.items || []).map((product) => (
          <ShopProductCard
            key={product.id}
            product={product}
            onPress={() => onProduct(product)}
          />
        ))}
      </View>
      {!catalog?.items.length && (
        <Text
          style={{
            color: colors.muted,
            fontSize: 13,
            paddingVertical: 22,
            textAlign: "center",
          }}
        >
          {loading
            ? "Preparando o catálogo…"
            : "Nenhum produto nesta busca. Experimente outra categoria."}
        </Text>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 16,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Truck size={20} color={colors.primary} />
        <Text
          style={{ flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18 }}
        >
          Calcule a entrega pelo CEP ou escolha retirada quando disponível.
        </Text>
      </View>
      {cartCount > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Abrir carrinho com ${cartCount} itens`}
          onPress={onCart}
          style={{
            padding: 17,
            borderRadius: 16,
            backgroundColor: colors.primaryStrong,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <ShoppingBag size={21} color={colors.onPrimary} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontWeight: "700",
                fontSize: 14,
                color: colors.onPrimary,
              }}
            >
              Meu carrinho · {cartCount}
            </Text>
            <Text style={{ fontSize: 11, color: colors.onPrimary }}>
              Continuar para entrega
            </Text>
          </View>
          <Text style={{ fontWeight: "700", color: colors.onPrimary }}>
            {money(cartTotal)}
          </Text>
          <ArrowUpRight color={colors.onPrimary} size={18} />
        </Pressable>
      )}
    </View>
  );
}
function ShopProductCard({
  product,
  onPress,
}: {
  product: Product;
  onPress: () => void;
}) {
  const { colors } = useTheme(),
    available = product.variants.reduce(
      (sum, variant) => sum + variant.available,
      0,
    ),
    test = product.variants.some((variant) =>
      variant.sku.startsWith("DEMO-ECP-"),
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${money(product.priceCents)}${available ? "" : ", esgotado"}`}
      onPress={onPress}
      style={({ pressed }) => ({
        width: "47%",
        flexGrow: 1,
        minWidth: 125,
        maxWidth: "100%",
        opacity: pressed ? 0.8 : 1,
        gap: 10,
        marginBottom: 8,
      })}
    >
      <View
        style={{
          aspectRatio: 1,
          borderRadius: 17,
          overflow: "hidden",
          backgroundColor: "#f4f0eb",
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <ProductImage
          uri={product.images[0]}
          label={product.name}
          style={{ width: "100%", height: "100%" }}
        />
        {(product.featured || test) && (
          <View
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              backgroundColor: product.featured ? "#b5212c" : "#fff7ef",
              borderRadius: 5,
              paddingHorizontal: 7,
              paddingVertical: 2,
            }}
          >
            <Text
              style={{
                color: product.featured ? "#ffffff" : "#773d35",
                fontSize: 9,
                fontWeight: "700",
                letterSpacing: 0.6,
              }}
            >
              {test ? "DEMONSTRAÇÃO" : "DESTAQUE"}
            </Text>
          </View>
        )}
        {!available && (
          <View
            style={{
              position: "absolute",
              bottom: 10,
              right: 10,
              left: 10,
              padding: 5,
              borderRadius: 7,
              backgroundColor: "#251414dd",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 10, textAlign: "center" }}>
              ESGOTADO
            </Text>
          </View>
        )}
      </View>
      <View style={{ gap: 3, paddingHorizontal: 2 }}>
        <Text style={{ fontSize: 10, color: colors.subtle }}>
          {product.category}
        </Text>
        <Text
          numberOfLines={2}
          style={{
            fontSize: 13,
            lineHeight: 19,
            fontWeight: "600",
            color: colors.text,
            minHeight: 38,
          }}
        >
          {product.name}
        </Text>
        {product.compareAtCents !== null && (
          <Text
            style={{
              fontSize: 10,
              lineHeight: 15,
              color: colors.subtle,
              textDecorationLine: "line-through",
            }}
          >
            {money(product.compareAtCents)}
          </Text>
        )}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 5,
          }}
        >
          <Text
            style={{
              fontSize: 19,
              fontWeight: "800",
              letterSpacing: -0.5,
              color: colors.text,
            }}
          >
            {money(product.priceCents)}
          </Text>
          <ArrowUpRight size={16} color={colors.primary} />
        </View>
        <Text style={{ fontSize: 10, color: colors.muted }}>
          {available
            ? "Ver tamanhos e detalhes"
            : "Avise a loja sobre seu interesse"}
        </Text>
      </View>
    </Pressable>
  );
}
