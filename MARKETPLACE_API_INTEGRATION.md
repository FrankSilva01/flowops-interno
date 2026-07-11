# Guia de Integração das APIs de Marketplace

## Status Atual (07/2026)

✅ **Mercado Livre** - Funcionando
- Criar anúncios
- Sincronizar
- Carregar campos dinâmicos

🟡 **Shopee** - Estrutura Pronta
- Campos HTML: ✅
- Dados sendo salvos: ✅
- API pronta para implementação

🟡 **TikTok Shop** - Estrutura Pronta
- Campos HTML: ✅
- Dados sendo salvos: ✅
- API pronta para implementação

🟡 **Amazon** - Estrutura Pronta (SP-API)
- Campos HTML: ✅
- Dados sendo salvos: ✅
- API pronta para implementação

---

## Dados Salvos por Marketplace

Todos os dados são salvos em `raw_payload` no banco de dados:

### Mercado Livre (raw_payload.category_id)
```javascript
{
  category_id: "MLB1953",      // Já funcionando
  listing_type_id: "gold_pro",
  condition: "new",
  warranty: "Sem garantia",
  sale_terms: [],
  attributes: []
}
```

### Shopee (raw_payload.shopee)
```javascript
{
  category_id: "123456",
  weight: 500,              // em gramas
  days_to_ship: 20,
  sku: "SHOPEE-001",
  attributes: [
    { attribute_id: 1, attribute_value_id: 1 }
  ]
}
```

### TikTok Shop (raw_payload.tiktok_shop)
```javascript
{
  product_id: "tiktok-123",
  weight: 500,              // em gramas
  delivery_days: 20,
  sku: "TIKTOK-001",
  attributes: [
    { id: "color", value: "red" }
  ]
}
```

### Amazon (raw_payload.amazon)
```javascript
{
  sku: "AMAZON-001",
  asin: "B0XX123456",
  product_type: "TOY_OR_GAME",
  attributes: [
    { attribute_name: "material", attribute_value: "plastic" }
  ]
}
```

---

## Pontos de Integração (Arquivo: js/features/marketplace.js)

### Para Shopee - Linha ~650

**Onde adicionar:**
```javascript
// Procure por: if (publishTargets.mercado_livre) {
// Logo depois, adicione:

if (publishTargets.shopee) {
  const shopeeData = {
    title: payload.title,
    price: payload.price,
    quantity: Number(data.get("available_quantity") || 1),
    category_id: data.get("shopee_category_id"),
    weight: payload.raw_payload.shopee.weight,
    days_to_ship: payload.raw_payload.shopee.days_to_ship,
    sku: payload.raw_payload.shopee.sku,
    pictures: [...imageUrls, ...storefrontUploadedImages],
    description: payload.description,
    attributes: payload.raw_payload.shopee.attributes,
  };
  
  // Chamar sua API Shopee aqui
  const created = await marketplaceRequest("[SEU_SHOPEE_ENDPOINT]", {
    method: "POST",
    body: JSON.stringify(shopeeData),
  });
  
  payload.external_id = created.item?.id || payload.external_id;
}
```

### Para TikTok Shop - Linha ~680

**Onde adicionar:**
```javascript
if (publishTargets.tiktok_shop) {
  const tiktokData = {
    title: payload.title,
    price: payload.price,
    quantity: Number(data.get("available_quantity") || 1),
    weight: payload.raw_payload.tiktok_shop.weight,
    delivery_days: payload.raw_payload.tiktok_shop.delivery_days,
    sku: payload.raw_payload.tiktok_shop.sku,
    pictures: [...imageUrls, ...storefrontUploadedImages],
    description: payload.description,
    attributes: payload.raw_payload.tiktok_shop.attributes,
  };
  
  // Chamar sua API TikTok Shop aqui
  const created = await marketplaceRequest("[SEU_TIKTOK_ENDPOINT]", {
    method: "POST",
    body: JSON.stringify(tiktokData),
  });
  
  payload.external_id = created.product_id || payload.external_id;
}
```

---

## Função Helper Para Requisições (Já Existe)

```javascript
// Usar essa função em marketplace.js linha ~300
async function marketplaceRequest(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${state.marketplaceTokens[marketplace]}`,
      "Content-Type": "application/json",
    },
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return await response.json();
}
```

---

## Próximos Passos

1. **Receber credenciais/tokens** das APIs
2. **Armazenar tokens** em `state.marketplaceTokens`
3. **Adicionar endpoints** nas requisições acima
4. **Testar criação** de produtos em cada marketplace
5. **Implementar sincronização** (import de pedidos)

---

## Checklist de Implementação

### Shopee
- [ ] Recebido Partner ID e Partner Key
- [ ] Endpoint da API confirmado
- [ ] Implementação em saveStorefrontProduct
- [ ] Testes com produtos reais
- [ ] Sincronização de vendas

### TikTok Shop
- [ ] Recebido API Key e Secret
- [ ] Endpoint da API confirmado
- [ ] Implementação em saveStorefrontProduct
- [ ] Testes com produtos reais
- [ ] Sincronização de vendas

### Amazon
- [ ] Recebido SP-API credenciais
- [ ] MWS role ARN configurado
- [ ] Implementação em saveStorefrontProduct
- [ ] Testes com produtos reais
- [ ] Sincronização de vendas

---

**Última atualização:** 11/07/2026
**Status:** Estrutura completa, aguardando APIs
