import { state, money } from "../core/state.js";
import { byId, showAppMessage, flashActionMessage } from "../core/dom.js";

function getMarketplaceDisplayName(value) {
  const marketplace = String(value || "").toLowerCase();
  if (marketplace.includes("shopee")) return "Shopee";
  if (marketplace.includes("amazon")) return "Amazon";
  if (marketplace.includes("tiktok")) return "TikTok Shop";
  return "Mercado Livre";
}

export function initMarketplaceExport() {
  const exportBtn = byId("exportListingsBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", openExportDialog);
  }
}

function openExportDialog() {
  const listings = state.marketplaceListings.filter(item =>
    state.marketplaceChannelFilter === "all" ||
    item.marketplace === state.marketplaceChannelFilter
  );

  if (listings.length === 0) {
    showAppMessage("Nenhum anúncio para exportar", "warning");
    return;
  }

  const dialog = document.createElement("div");
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--panel);
    padding: 32px;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    z-index: 10000;
    max-width: 500px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
  `;

  dialog.innerHTML = `
    <h2 style="margin: 0 0 24px 0; font-size: 18px; font-weight: 700; color: var(--ink);">
      📤 Exportar Anúncios
    </h2>

    <p style="color: var(--muted); margin-bottom: 20px; font-size: 13px;">
      Escolha o formato desejado para exportar ${listings.length} anúncio${listings.length !== 1 ? 's' : ''}
    </p>

    <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
      <button id="exportJSON" style="
        padding: 12px 16px;
        background: var(--canvas);
        border: 1px solid var(--line);
        border-radius: 8px;
        color: var(--ink);
        cursor: pointer;
        font-weight: 600;
        text-align: left;
        transition: all 0.2s;
      " onmouseover="this.style.borderColor='#00D084'; this.style.background='rgba(0, 208, 132, 0.1)'" onmouseout="this.style.borderColor='var(--line)'; this.style.background='var(--canvas)'">
        <strong>📋 JSON</strong>
        <small style="display: block; color: var(--muted); font-weight: 400; margin-top: 4px;">Formato estruturado, ideal para importação em sistemas</small>
      </button>

      <button id="exportCSV" style="
        padding: 12px 16px;
        background: var(--canvas);
        border: 1px solid var(--line);
        border-radius: 8px;
        color: var(--ink);
        cursor: pointer;
        font-weight: 600;
        text-align: left;
        transition: all 0.2s;
      " onmouseover="this.style.borderColor='#00D084'; this.style.background='rgba(0, 208, 132, 0.1)'" onmouseout="this.style.borderColor='var(--line)'; this.style.background='var(--canvas)'">
        <strong>📊 CSV (Excel/Sheets)</strong>
        <small style="display: block; color: var(--muted); font-weight: 400; margin-top: 4px;">Compatível com Excel e Google Sheets para edição rápida</small>
      </button>

      <button id="exportXML" style="
        padding: 12px 16px;
        background: var(--canvas);
        border: 1px solid var(--line);
        border-radius: 8px;
        color: var(--ink);
        cursor: pointer;
        font-weight: 600;
        text-align: left;
        transition: all 0.2s;
      " onmouseover="this.style.borderColor='#00D084'; this.style.background='rgba(0, 208, 132, 0.1)'" onmouseout="this.style.borderColor='var(--line)'; this.style.background='var(--canvas)'">
        <strong>📑 XML</strong>
        <small style="display: block; color: var(--muted); font-weight: 400; margin-top: 4px;">Padrão para muitos sistemas e integrações</small>
      </button>

      <button id="exportHTML" style="
        padding: 12px 16px;
        background: var(--canvas);
        border: 1px solid var(--line);
        border-radius: 8px;
        color: var(--ink);
        cursor: pointer;
        font-weight: 600;
        text-align: left;
        transition: all 0.2s;
      " onmouseover="this.style.borderColor='#00D084'; this.style.background='rgba(0, 208, 132, 0.1)'" onmouseout="this.style.borderColor='var(--line)'; this.style.background='var(--canvas)'">
        <strong>🌐 HTML (com imagens)</strong>
        <small style="display: block; color: var(--muted); font-weight: 400; margin-top: 4px;">Catálogo completo com fotos e descrições</small>
      </button>
    </div>

    <div style="display: flex; gap: 12px; justify-content: flex-end;">
      <button id="cancelExport" style="
        background: transparent;
        border: 1px solid var(--line);
        color: var(--ink);
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
      ">Cancelar</button>
    </div>
  `;

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 9999;
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  byId("exportJSON").addEventListener("click", () => {
    exportListingsAsJSON(listings);
    overlay.remove();
    dialog.remove();
  });

  byId("exportCSV").addEventListener("click", () => {
    exportListingsAsCSV(listings);
    overlay.remove();
    dialog.remove();
  });

  byId("exportXML").addEventListener("click", () => {
    exportListingsAsXML(listings);
    overlay.remove();
    dialog.remove();
  });

  byId("exportHTML").addEventListener("click", () => {
    exportListingsAsHTML(listings);
    overlay.remove();
    dialog.remove();
  });

  byId("cancelExport").addEventListener("click", () => {
    overlay.remove();
    dialog.remove();
  });
}

function exportListingsAsJSON(listings) {
  const data = listings.map(item => ({
    titulo: item.title,
    descricao: item.description || "",
    marketplace: getMarketplaceDisplayName(item.marketplace),
    preco: parseFloat(item.price || 0),
    estoque: parseInt(item.stock || item.available_quantity || 0),
    sku: item.sku || "",
    id_externo: item.external_id,
    status: item.status,
    foto_url: item.thumbnail_url || "",
    link_marketplace: `https://${getMarketplaceHost(item.marketplace)}/p/${item.external_id}`,
    visualizacoes: parseInt(item.views || item.views_today || 0),
    conversao: parseFloat(item.conversion || 0),
    criado_em: item.created_at || "",
    atualizado_em: item.updated_at || "",
  }));

  const json = JSON.stringify(data, null, 2);
  downloadFile(json, "anuncios-exportados.json", "application/json");
  flashActionMessage(`✅ ${listings.length} anúncio${listings.length !== 1 ? 's' : ''} exportado${listings.length !== 1 ? 's' : ''} em JSON!`);
}

function exportListingsAsCSV(listings) {
  const headers = [
    "Título",
    "Descrição",
    "Marketplace",
    "Preço",
    "Estoque",
    "SKU",
    "ID Externo",
    "Status",
    "Foto URL",
    "Link Marketplace",
    "Visualizações",
    "Conversão %",
    "Criado em",
    "Atualizado em",
  ];

  const rows = listings.map(item => [
    `"${(item.title || "").replace(/"/g, '""')}"`,
    `"${(item.description || "").replace(/"/g, '""')}"`,
    getMarketplaceDisplayName(item.marketplace),
    item.price || 0,
    item.stock || item.available_quantity || 0,
    item.sku || "",
    item.external_id || "",
    item.status || "",
    item.thumbnail_url || "",
    `https://${getMarketplaceHost(item.marketplace)}/p/${item.external_id}`,
    item.views || item.views_today || 0,
    item.conversion || 0,
    item.created_at || "",
    item.updated_at || "",
  ]);

  const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
  downloadFile(csv, "anuncios-exportados.csv", "text/csv;charset=utf-8;");
  flashActionMessage(`✅ ${listings.length} anúncio${listings.length !== 1 ? 's' : ''} exportado${listings.length !== 1 ? 's' : ''} em CSV!`);
}

function exportListingsAsXML(listings) {
  const items = listings.map(item => `
  <anuncio>
    <titulo>${escapeXML(item.title || "")}</titulo>
    <descricao>${escapeXML(item.description || "")}</descricao>
    <marketplace>${escapeXML(getMarketplaceDisplayName(item.marketplace))}</marketplace>
    <preco>${item.price || 0}</preco>
    <estoque>${item.stock || item.available_quantity || 0}</estoque>
    <sku>${escapeXML(item.sku || "")}</sku>
    <id_externo>${escapeXML(item.external_id || "")}</id_externo>
    <status>${escapeXML(item.status || "")}</status>
    <foto_url>${escapeXML(item.thumbnail_url || "")}</foto_url>
    <link_marketplace>https://${getMarketplaceHost(item.marketplace)}/p/${item.external_id}</link_marketplace>
    <visualizacoes>${item.views || item.views_today || 0}</visualizacoes>
    <conversao>${item.conversion || 0}</conversao>
    <criado_em>${escapeXML(item.created_at || "")}</criado_em>
    <atualizado_em>${escapeXML(item.updated_at || "")}</atualizado_em>
  </anuncio>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<anuncios>
${items}
</anuncios>`;

  downloadFile(xml, "anuncios-exportados.xml", "application/xml");
  flashActionMessage(`✅ ${listings.length} anúncio${listings.length !== 1 ? 's' : ''} exportado${listings.length !== 1 ? 's' : ''} em XML!`);
}

function exportListingsAsHTML(listings) {
  const timestamp = new Date().toLocaleString("pt-BR");
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Catálogo de Anúncios</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      background: #f5f5f5;
      color: #333;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #00D084 0%, #00a366 100%);
      color: white;
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 30px;
      text-align: center;
    }
    .header h1 { font-size: 28px; margin-bottom: 8px; }
    .header p { opacity: 0.9; }
    .catalog {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .listing-card {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .listing-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 16px rgba(0,0,0,0.15);
    }
    .listing-image {
      width: 100%;
      height: 200px;
      background: #e0e0e0;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .listing-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .listing-image.empty {
      color: #999;
      font-size: 12px;
    }
    .listing-body {
      padding: 16px;
    }
    .listing-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      line-height: 1.4;
      min-height: 28px;
      color: #000;
    }
    .listing-meta {
      font-size: 12px;
      color: #666;
      margin-bottom: 12px;
    }
    .listing-price {
      font-size: 18px;
      font-weight: 700;
      color: #00D084;
      margin-bottom: 8px;
    }
    .listing-stats {
      display: flex;
      gap: 12px;
      font-size: 11px;
      color: #999;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid #eee;
    }
    .listing-stat {
      flex: 1;
      text-align: center;
    }
    .listing-stat strong {
      display: block;
      font-size: 13px;
      color: #333;
      font-weight: 600;
    }
    .listing-description {
      font-size: 12px;
      color: #666;
      margin-bottom: 12px;
      line-height: 1.4;
      max-height: 60px;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }
    .listing-footer {
      display: flex;
      gap: 8px;
      font-size: 11px;
    }
    .listing-badge {
      flex: 1;
      padding: 6px;
      background: #f0f0f0;
      border-radius: 4px;
      text-align: center;
      font-weight: 500;
    }
    .listing-badge.marketplace {
      background: rgba(0, 208, 132, 0.1);
      color: #00D084;
    }
    .listing-badge.status {
      background: rgba(0, 208, 132, 0.1);
      color: #00D084;
    }
    .listing-badge.status.inactive {
      background: #ffebee;
      color: #c62828;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding: 20px;
      color: #999;
      font-size: 12px;
    }
    .footer a {
      color: #00D084;
      text-decoration: none;
    }
    @media print {
      body { background: white; }
      .listing-card { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📦 Catálogo de Anúncios</h1>
    <p>Exportado em ${timestamp}</p>
    <p>${listings.length} produto${listings.length !== 1 ? 's' : ''}</p>
  </div>

  <div class="catalog">
    ${listings.map(item => `
      <div class="listing-card">
        <div class="listing-image ${item.thumbnail_url ? '' : 'empty'}">
          ${item.thumbnail_url ? `<img src="${item.thumbnail_url}" alt="${escapeHTML(item.title)}" loading="lazy">` : '<span>Sem imagem</span>'}
        </div>
        <div class="listing-body">
          <div class="listing-title">${escapeHTML(item.title || "")}</div>
          <div class="listing-meta">${escapeHTML(item.external_id || "")}</div>
          <div class="listing-price">R$ ${formatPrice(item.price || 0)}</div>
          <div class="listing-stats">
            <div class="listing-stat">
              <strong>${item.stock || item.available_quantity || 0}</strong>
              em estoque
            </div>
            <div class="listing-stat">
              <strong>${item.views || item.views_today || 0}</strong>
              visualizações
            </div>
            <div class="listing-stat">
              <strong>${item.conversion || 0}%</strong>
              conversão
            </div>
          </div>
          ${item.description ? `<div class="listing-description">${escapeHTML(item.description)}</div>` : ''}
          <div class="listing-footer">
            <span class="listing-badge marketplace">${escapeHTML(getMarketplaceDisplayName(item.marketplace))}</span>
            <span class="listing-badge status ${item.status !== 'active' ? 'inactive' : ''}">${escapeHTML(item.status || 'ativo')}</span>
          </div>
        </div>
      </div>
    `).join('')}
  </div>

  <div class="footer">
    <p>Este catálogo foi gerado automaticamente pelo FlowOps</p>
    <p>Para atualizar, exporte novamente a partir da aba Marketplace</p>
  </div>

  <script>
    document.querySelectorAll('.listing-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const img = card.querySelector('.listing-image img');
        if (img && e.target !== img) {
          img.requestFullscreen?.();
        }
      });
    });
  </script>
</body>
</html>`;

  downloadFile(html, "catalogo-anuncios.html", "text/html;charset=utf-8");
  flashActionMessage(`✅ Catálogo em HTML gerado com ${listings.length} anúncio${listings.length !== 1 ? 's' : ''}!`);
}

function escapeXML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatPrice(price) {
  return parseFloat(price || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getMarketplaceHost(marketplace) {
  const normalized = String(marketplace || "").toLowerCase();
  if (normalized.includes("shopee")) return "shopee.com.br";
  if (normalized.includes("amazon")) return "amazon.com.br";
  if (normalized.includes("tiktok")) return "tiktok.com";
  return "mercadolivre.com.br";
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}
