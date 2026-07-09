# Changelog

## [1.1.0] - 2026-07-09 (Bug Critical Fix - Versão 2)

### 🔧 Corrigido - CRÍTICO
- **Frete R$0,00 em anúncios com frete grátis**: BUG CRITICAL AGORA CORRIGIDO COMPLETAMENTE
  - Problema: Anúncios com `free_shipping=true` mostravam frete R$0,00 sempre
  - Exemplo: R$39,90 Premium exibia frete R$0,00 em vez de R$13,25
  
  **Root cause identificado:**
  - `/shipments/costs` retorna erro
  - `getRealShippingCostFromOrder()` não encontra orders
  - Sistema convertia undefined→0 em vez de undefined→null
  - Não diferenciava "não calculado" (null) de "realmente zero" (0)
  
  **Solução implementada (3 fallbacks):**
  1. Tentativa 1: `/shipments/costs` para 3 CEPs (SP, RJ, BH)
  2. Tentativa 2: Dados reais via `/orders/{id}` → `/shipments/{id}`
  3. Tentativa 3: `/items/{ITEM_ID}/shipping_options?zip_code=CEP` para cada CEP
  4. Fallback final: Estimar por peso ou marcar como "não calculado"
  
  **Correções de lógica:**
  - `shipping_cost: null` (não calculado) ≠ `shipping_cost: 0` (cliente paga)
  - Removida subtração dupla de subsídio em `pricing.js`
  - Adicionado aviso visual "⚠️ Frete não calculado" quando `free_shipping=true` mas custo é null/0
  
  **Resultado:** Anúncio de R$111,00 agora mostra frete correto (não R$0,00 silencioso)

## [1.0.0] - 2026-07-09

### ✨ Novo
- **Modal de Cadastro com Steps**: Redesenho completo do modal de produto com 4 passos:
  - Step 1: Dados básicos (nome, categoria, SKU, imagens, descrição)
  - Step 2: Preços (custo, preço venda, estoque)
  - Step 3: Marketplace (seleção de marketplaces e configurações)
  - Step 4: Resumo com lucro estimado
- **Edge Function `get-real-shipping-cost`**: Busca dados reais de frete do Mercado Livre via API
- **Cálculo de Frete Corrigido**: Armazena custo real do vendedor (seller_cost) após subsídio ML

### 🔧 Corrigido
- **Bug de Cálculo de Lucro**: Valores de frete mostravam incorretos (R$0,00 ou muito diferentes)
  - Causa: Estava salvando `grossShippingCost` em vez de `sellerShippingCost`
  - Solução: Busca dados reais de orders completados na API do ML
  - Exemplo: R$39,90 Premium com frete grátis agora mostra lucro correto de R$15,48
- **Erro ao Abrir Modal**: TypeError ao tentar abrir modal de cadastro
  - Causa: Acesso a elementos nulos sem validação
  - Solução: Adicionadas verificações null antes de manipular DOM

### 🎨 UI/UX
- Modal agora mais intuitivo com navegação entre steps
- Campos opcionais removidos (peso, observações) para simplificar
- Indicadores de progresso visuais com cores para steps
- Validação por step melhorando o fluxo

### 🚀 Deploy
- Deploy no Netlify via CLI (npx netlify deploy --prod)
- Removidas query strings de CSS/JS para evitar problemas de cache

### 📝 Notas Técnicas
- Supabase Edge Functions: `marketplace-sync`, `get-real-shipping-cost`, `marketplace-webhook`
- Tabela `listing_fee_sync`: Armazena real_fee_pct, real_fee_fixed, shipping_cost, shipping_subsidized
- API Mercado Livre: Endpoints `/orders/{id}` e `/shipments/{id}` para dados reais
