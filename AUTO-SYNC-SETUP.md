# 🚀 Configuração de Sincronização Automática de Taxas

A sincronização automática foi implementada em 3 camadas:

## 1️⃣ Webhook do Mercado Livre (Recomendado)
**Velocidade:** < 10 segundos
**Confiabilidade:** Alta (dispara imediatamente quando anúncio muda)

### Setup:

1. Acesse: https://apps.mercadolibre.com.br/notificaciones
2. Clique em **Criar nova notificação**
3. Preencha:
   - **Aplicación:** Selecione sua app (ou crie uma em dev.mercadolibre.com)
   - **URL:** `https://seu-projeto.supabase.co/functions/v1/marketplace-webhook`
   - **Eventos:** Marque:
     - `item.updated`
     - `item.price_updated`
     - `item.status_updated`
     - `item.shipping_updated`
   - **Secret:** (opcional) deixe em branco por enquanto

4. **Teste:** Edite qualquer anúncio no ML e veja em tempo real:
   - Vá em: Marketplace → Inteligência → aba Webhook
   - Verá log de sincronização automática

---

## 2️⃣ Cron Job de Fallback (4h)
**Velocidade:** até 4 horas
**Confiabilidade:** Muito alta (não depende de webhook)

### Setup (escolha uma opção):

### Opção A: Vercel Crons (Recomendado)
1. Adicione ao `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/functions/v1/marketplace-sync?action=fee-calculator-full",
      "schedule": "0 */4 * * *"
    }
  ]
}
```

2. Adicione header no Vercel:
   - `Authorization: Bearer {SEU_SERVICE_ROLE_KEY}`

### Opção B: EasyCron ou Similar
Configure um cron externo chamando:
```
GET https://seu-projeto.supabase.co/functions/v1/marketplace-sync?action=fee-calculator-full
Header: Authorization: Bearer {SEU_SERVICE_ROLE_KEY}
Frequência: A cada 4 horas
```

### Opção C: GitHub Actions
Crie `.github/workflows/sync-taxes.yml`:
```yaml
name: Sync Marketplace Taxes
on:
  schedule:
    - cron: '0 */4 * * *'
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Sync fees
        run: |
          curl -X GET \
            'https://seu-projeto.supabase.co/functions/v1/marketplace-sync?action=fee-calculator-full' \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}"
```

---

## 3️⃣ Sincronização Manual (Fallback)
**Velocidade:** Instantânea (clique)
**Uso:** Se webhook ou cron falharem

Mantém o botão "Sincronizar taxas" como fallback manual.

---

## 🔍 Monitoramento

### Ver último status:
1. Vá em: **Marketplace → Inteligência → Webhook**
2. Veja timestamp da última sincronização

### Ver erros:
1. Acesse logs do Supabase:
   - Dashboard Supabase → Functions → marketplace-webhook
   - Veja execuções e erros

---

## 📊 Fluxo Atual

```
Anúncio é editado no ML
        ↓
Webhook ML → POST /marketplace-webhook
        ↓
Fetch dados de taxa/frete em tempo real
        ↓
Salva em listing_fee_sync
        ↓
Front-end usa dado sincronizado automaticamente ✅
```

---

## ⚙️ Próximos Passos

1. ✅ Deploy da Edge Function `marketplace-webhook`
2. ⏳ Registrar webhook no Mercado Livre (você)
3. ⏳ Configurar cron job de fallback (você)
4. ⏳ Testar editando um anúncio

---

## Perguntas Frequentes

**P: Quanto tempo leva pra sincronizar?**
A: Webhook: < 10s | Cron: até 4h | Manual: instantâneo

**P: E se o webhook falhar?**
A: Cron job sincroniza tudo a cada 4 horas como fallback

**P: Preciso do botão "Sincronizar" ainda?**
A: Não, mas deixei como fallback. Pode remover depois.

**P: Como saber se tá funcionando?**
A: Vá em Webhook e veja logs. Ou edite um anúncio e veja se atualiza em tempo real.

