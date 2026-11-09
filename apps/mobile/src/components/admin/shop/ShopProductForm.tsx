import { ProductImage } from "../../shop/ProductImage";
import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Plus, Trash2, Package, Shuffle } from "lucide-react-native";
import type { Product } from "@nacional/shared/shop";
import { centsInput } from "@nacional/shared/forms";
import { useSession } from "../../../providers/SessionProvider";
import { useTheme } from "../../../theme/ThemeProvider";
import { shopAdminApi } from "../../../services/shop";
import { messageOf } from "../../../utils/format";
import { parseAmount } from "../../../utils/payments";
import { Text } from "../../Typography";
import { Sheet } from "../../Sheet";
import {
  AdminButton,
  AdminField,
  AdminToggle,
  AdminSection,
  AdminFormGrid,
  AdminNotice,
} from "../AdminControls";
import { useShopAction } from "./useShopAction";
type VariantDraft = {
  id?: string;
  sku: string;
  label: string;
  stock: string;
  lowStock: string;
  active: boolean;
};
const integer = (value: string, label: string, min = 0) => {
  if (!/^\d+$/.test(value) || Number(value) < min)
    throw new Error(
      `Informe ${label} em número inteiro${min ? " maior que zero" : ""}.`,
    );
  return Number(value);
};
export function ShopProductForm({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: (saved: Product) => Promise<unknown>;
}) {
  const { token } = useSession(),
    { colors } = useTheme();
  const [name, setName] = useState(product?.name || ""),
    [description, setDescription] = useState(product?.description || ""),
    [category, setCategory] = useState(product?.category || "Geral");
  const [price, setPrice] = useState(
      product ? centsInput(product.priceCents) : "",
    ),
    [compare, setCompare] = useState(
      product?.compareAtCents ? centsInput(product.compareAtCents) : "",
    ),
    [cost, setCost] = useState(centsInput(product?.costCents || 0));
  const [images, setImages] = useState(product?.images || [""]),
    [active, setActive] = useState(product?.active ?? true),
    [featured, setFeatured] = useState(product?.featured || false);
  const [weight, setWeight] = useState(String(product?.weightGrams || 300)),
    [width, setWidth] = useState(String(product?.widthCm || 20)),
    [height, setHeight] = useState(String(product?.heightCm || 5)),
    [length, setLength] = useState(String(product?.lengthCm || 25));
  const [advanced, setAdvanced] = useState(false);
  const [variants, setVariants] = useState<VariantDraft[]>(
    product?.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      label: variant.label,
      stock: String(variant.stock),
      lowStock: String(variant.lowStock),
      active: variant.active,
    })) || [
      { sku: "", label: "Único", stock: "0", lowStock: "5", active: true },
    ],
  );
  const { busy, error, run } = useShopAction();
  const [generating, setGenerating] = useState<number | null>(null),
    [skuStates, setSkuStates] = useState<Record<string, string>>({}),
    [checking, setChecking] = useState(false),
    [skuError, setSkuError] = useState("");
  const generationLock = useRef(false),
    alive = useRef(true);
  const skuKey = JSON.stringify(
    variants
      .map((v) => ({
        sku: v.sku.trim().toUpperCase(),
        ...(v.id ? { variantId: v.id } : {}),
      }))
      .filter((v) => v.sku),
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    setSkuStates({});
    setSkuError("");
    const items = JSON.parse(skuKey);
    if (!items.length || !token) {
      setChecking(false);
      return;
    }
    setChecking(true);
    const timer = setTimeout(() => {
      void shopAdminApi
        .checkSkus(token, items)
        .then((values) => {
          if (current)
            setSkuStates(
              Object.fromEntries(values.map((v) => [v.sku, v.status])),
            );
        })
        .catch(() => {
          if (current)
            setSkuError(
              "Não foi possível consultar os SKUs. Ao salvar, a API confere novamente.",
            );
        })
        .finally(() => {
          if (current) setChecking(false);
        });
    }, 500);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [skuKey, token]);
  const blocked = busy || generating !== null;
  async function generate(index: number) {
    if (!token || generationLock.current || busy) return;
    generationLock.current = true;
    setGenerating(index);
    setSkuError("");
    try {
      const { sku } = await shopAdminApi.generateSku(
        token,
        variants.map((v) => v.sku.trim()).filter(Boolean),
      );
      if (alive.current) change(index, { sku });
    } catch (err) {
      if (alive.current) setSkuError(messageOf(err));
    } finally {
      generationLock.current = false;
      if (alive.current) setGenerating(null);
    }
  }
  function change(index: number, patch: Partial<VariantDraft>) {
    setVariants((rows) =>
      rows.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    );
  }
  async function save() {
    const saved = await shopAdminApi.saveProduct(token!, {
      ...(product ? { id: product.id, version: product.version } : {}),
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      images: images.map((image) => image.trim()).filter(Boolean),
      priceCents: parseAmount(price, true),
      compareAtCents: compare ? parseAmount(compare, true) : null,
      costCents: parseAmount(cost || "0,00", true),
      active,
      featured,
      weightGrams: integer(weight, "o peso", 1),
      widthCm: integer(width, "a largura", 1),
      heightCm: integer(height, "a altura", 1),
      lengthCm: integer(length, "o comprimento", 1),
      variants: variants.map((variant) => ({
        ...(variant.id
          ? { id: variant.id }
          : { initialStock: integer(variant.stock, "o estoque") }),
        sku: variant.sku.trim(),
        label: variant.label.trim(),
        active: variant.active,
        lowStock: integer(variant.lowStock, "o alerta de estoque"),
      })),
    });
    await onSaved(saved);
  }
  return (
    <Sheet
      visible
      title={product ? "Editar produto" : "Novo produto"}
      onClose={blocked ? () => {} : onClose}
    >
      <AdminSection
        title="Informações do produto"
        description="Cadastre o que o torcedor verá na loja."
      >
        <AdminField
          label="Nome do produto"
          required
          value={name}
          onChange={setName}
          placeholder="Ex.: Camisa oficial 2026"
          maxLength={150}
          editable={!blocked}
        />
        <AdminFormGrid>
          <AdminField
            label="Preço de venda"
            required
            prefix="R$"
            value={price}
            onChange={setPrice}
            placeholder="0,00"
            numeric
            editable={!blocked}
          />
          <AdminField
            label="Categoria"
            value={category}
            onChange={setCategory}
            placeholder="Camisas, acessórios…"
            maxLength={80}
            editable={!blocked}
          />
        </AdminFormGrid>
        <AdminField
          label="Descrição"
          value={description}
          onChange={setDescription}
          multiline
          placeholder="Material, cuidados e detalhes do produto"
          maxLength={4000}
          editable={!blocked}
        />
        <AdminToggle
          label="Disponível na loja"
          value={active}
          onChange={setActive}
          disabled={blocked}
        />
        <AdminToggle
          label="Destacar no catálogo"
          value={featured}
          onChange={setFeatured}
          disabled={blocked}
        />
      </AdminSection>
      <AdminSection
        title="Variações e estoque"
        description="Use “Único” para produtos sem tamanho ou cor. Cada variação precisa de um SKU exclusivo."
      >
        {variants.map((variant, index) => (
          <View
            key={variant.id || `new-${index}`}
            style={{
              padding: 14,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              gap: 12,
            }}
          >
            <AdminFormGrid>
              <AdminField
                label="Variação"
                required
                value={variant.label}
                onChange={(label) => change(index, { label })}
                placeholder="Ex.: M · Vermelha"
                editable={!blocked}
              />
              <View style={{ gap: 6 }}>
                <AdminField
                  label="SKU / referência"
                  required
                  value={variant.sku}
                  onChange={(sku) => change(index, { sku: sku.toUpperCase() })}
                  autoCapitalize="characters"
                  placeholder="CAM-2026-M"
                  maxLength={80}
                  editable={!blocked}
                />
                <View style={{ alignSelf: "flex-start" }}>
                  <AdminButton
                    primary
                    size="small"
                    label="Gerar"
                    icon={Shuffle}
                    loading={generating === index}
                    disabled={blocked}
                    onPress={() => void generate(index)}
                  />
                </View>
                {!!variant.sku.trim() && (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={{
                      fontSize: 11,
                      lineHeight: 17,
                      color:
                        variants.filter(
                          (v) =>
                            v.sku.trim().toUpperCase() ===
                            variant.sku.trim().toUpperCase(),
                        ).length > 1 ||
                        skuStates[variant.sku.trim().toUpperCase()] === "USED"
                          ? colors.danger
                          : colors.muted,
                    }}
                  >
                    {variants.filter(
                      (v) =>
                        v.sku.trim().toUpperCase() ===
                        variant.sku.trim().toUpperCase(),
                    ).length > 1
                      ? "Repetido neste formulário. Gere outro SKU."
                      : skuStates[variant.sku.trim().toUpperCase()] === "USED"
                        ? "Já cadastrado em outra variação. Gere outro SKU."
                        : skuStates[variant.sku.trim().toUpperCase()] ===
                            "CURRENT"
                          ? "Referência atual desta variação."
                          : skuStates[variant.sku.trim().toUpperCase()] ===
                              "AVAILABLE"
                            ? "Disponível para cadastrar."
                            : checking
                              ? "Conferindo no banco..."
                              : "Será conferido ao salvar."}
                  </Text>
                )}
              </View>
            </AdminFormGrid>
            <AdminFormGrid>
              <AdminField
                label={variant.id ? "Estoque físico atual" : "Estoque inicial"}
                value={variant.stock}
                onChange={(stock) => change(index, { stock })}
                keyboardType="number-pad"
                editable={!variant.id && !blocked}
                hint={
                  variant.id
                    ? "Para entradas ou baixas, use a aba Estoque."
                    : undefined
                }
              />
              <AdminField
                label="Alertar quando restarem"
                value={variant.lowStock}
                onChange={(lowStock) => change(index, { lowStock })}
                keyboardType="number-pad"
                editable={!blocked}
              />
            </AdminFormGrid>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <AdminToggle
                label="Variação ativa"
                value={variant.active}
                onChange={(value) => change(index, { active: value })}
                disabled={blocked}
              />
              {!variant.id && variants.length > 1 && (
                <AdminButton
                  label="Remover variação"
                  icon={Trash2}
                  iconOnly
                  variant="ghost"
                  disabled={blocked}
                  onPress={() =>
                    setVariants((rows) =>
                      rows.filter((_, position) => position !== index),
                    )
                  }
                />
              )}
            </View>
          </View>
        ))}
        <AdminButton
          label="Adicionar tamanho ou cor"
          icon={Plus}
          disabled={blocked || variants.length >= 50}
          onPress={() =>
            setVariants((rows) => [
              ...rows,
              { sku: "", label: "", stock: "0", lowStock: "5", active: true },
            ])
          }
        />
      </AdminSection>
      <AdminSection
        title="Fotos"
        description="Cole o endereço HTTPS de uma imagem já hospedada. A primeira foto será a capa."
      >
        {images.map((image, index) => (
          <View key={index} style={{ gap: 8 }}>
            <AdminField
              label={index ? `Foto ${index + 1}` : "Foto de capa"}
              value={image}
              onChange={(text) =>
                setImages((rows) =>
                  rows.map((row, i) => (i === index ? text : row)),
                )
              }
              autoCapitalize="none"
              keyboardType="url"
              placeholder="https://…/foto.jpg"
              editable={!blocked}
            />
            {!!image && /^(https:\/\/|\/media\/shop\/)/i.test(image) && (
              <ProductImage
                uri={image}
                label="Prévia da foto do produto"
                style={{ width: 90, height: 90, borderRadius: 8 }}
              />
            )}
            {images.length > 1 && (
              <AdminButton
                label="Remover foto"
                variant="ghost"
                disabled={blocked}
                onPress={() =>
                  setImages((rows) => rows.filter((_, i) => i !== index))
                }
              />
            )}
          </View>
        ))}
        <AdminButton
          label="Adicionar outra foto"
          icon={Plus}
          disabled={blocked || images.length >= 8}
          onPress={() => setImages([...images, ""])}
        />
      </AdminSection>
      <AdminButton
        label={
          advanced
            ? "Recolher preço anterior, custo e envio"
            : "Preço anterior, custo e medidas de envio"
        }
        icon={Package}
        onPress={() => setAdvanced(!advanced)}
      />
      {advanced && (
        <AdminSection
          title="Preços e embalagem"
          description="Informe peso e medidas do produto embalado. Valores incorretos podem alterar o frete cobrado na postagem."
        >
          <AdminFormGrid>
            <AdminField
              label="Preço anterior (opcional)"
              prefix="R$"
              value={compare}
              onChange={setCompare}
              numeric
              editable={!blocked}
            />
            <AdminField
              label="Custo interno"
              prefix="R$"
              value={cost}
              onChange={setCost}
              numeric
              editable={!blocked}
            />
          </AdminFormGrid>
          <AdminFormGrid>
            <AdminField
              label="Peso em gramas"
              value={weight}
              onChange={setWeight}
              keyboardType="number-pad"
              required
              editable={!blocked}
            />
            <AdminField
              label="Largura em cm"
              value={width}
              onChange={setWidth}
              keyboardType="number-pad"
              required
              editable={!blocked}
            />
            <AdminField
              label="Altura em cm"
              value={height}
              onChange={setHeight}
              keyboardType="number-pad"
              required
              editable={!blocked}
            />
            <AdminField
              label="Comprimento em cm"
              value={length}
              onChange={setLength}
              keyboardType="number-pad"
              required
              editable={!blocked}
            />
          </AdminFormGrid>
        </AdminSection>
      )}
      {!!skuError && <AdminNotice tone="warning">{skuError}</AdminNotice>}
      {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
      <Text style={{ color: colors.subtle, fontSize: 11 }}>
        O estoque reservado é calculado automaticamente. As alterações ficam
        registradas na auditoria.
      </Text>
      <AdminButton
        primary
        label="Salvar produto"
        loading={busy}
        disabled={
          blocked ||
          Object.values(skuStates).includes("USED") ||
          new Set(variants.map((v) => v.sku.trim().toUpperCase())).size !==
            variants.length ||
          !name.trim() ||
          !price.trim() ||
          variants.some(
            (variant) => !variant.sku.trim() || !variant.label.trim(),
          )
        }
        onPress={() => void run(save)}
      />
    </Sheet>
  );
}
