import { state, money } from "../core/state.js";
import { byId, html, showAppMessage, flashActionMessage } from "../core/dom.js";

// ========================================================================
// ETIQUETAS VENDAS DIRETAS
// ========================================================================

export async function generateShippingLabel(orderId) {
  const order = state.data?.orders?.find(o => o.id === orderId);
  if (!order) {
    showAppMessage("Pedido nao encontrado", "error");
    return;
  }

  // Validar endereço
  if (!hasCompleteAddress(order)) {
    showAppMessage("Falta endereço completo no pedido", "error");
    editOrderAddress(orderId);
    return;
  }

  try {
    showAppMessage("Gerando etiqueta...", "info");

    // Importar jsPDF
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.onload = () => {
      createPDFLabel(order);
    };
    document.head.appendChild(script);
  } catch (error) {
    showAppMessage(`Erro ao gerar etiqueta: ${error.message}`, "error");
  }
}

function hasCompleteAddress(order) {
  return (
    order.address_street &&
    order.address_number &&
    order.address_neighborhood &&
    order.address_city &&
    order.address_state &&
    order.address_zip
  );
}

function createPDFLabel(order) {
  const html = generateLabelHTML(order);
  const element = document.createElement("div");
  element.innerHTML = html;
  element.style.padding = "20px";
  element.style.backgroundColor = "#fff";

  // Usar html2pdf
  const opt = {
    margin: 5,
    filename: `etiqueta_${order.id}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  };

  // @ts-ignore
  html2pdf().set(opt).from(element).save();

  flashActionMessage(`Etiqueta gerada: etiqueta_${order.id}.pdf ✅`);
}

function generateLabelHTML(order) {
  const now = new Date();
  const company = state.organizationName || "Sua Empresa";

  return `
    <div style="font-family: Arial, sans-serif; max-width: 200mm; margin: 0 auto;">
      <!-- ETIQUETA CORREIOS A4 (105x148mm) -->
      <div style="
        width: 105mm;
        height: 148mm;
        border: 2px solid #000;
        padding: 8mm;
        page-break-after: always;
        position: relative;
      ">
        <!-- Cabeçalho -->
        <div style="text-align: center; margin-bottom: 8mm; border-bottom: 1px solid #000; padding-bottom: 4mm;">
          <strong style="font-size: 14pt;">OBJETO DE VALOR DECLARADO</strong>
          <div style="font-size: 10pt;">SERVIÇO DE ENTREGA</div>
        </div>

        <!-- Remetente -->
        <div style="font-size: 9pt; margin-bottom: 6mm;">
          <strong>REMETENTE</strong>
          <div>${company}</div>
          <div>${state.organizationInfo?.street || "Rua"} ${state.organizationInfo?.number || "0"}</div>
          <div>${state.organizationInfo?.neighborhood || "Bairro"}</div>
          <div>${state.organizationInfo?.city || "Cidade"} - ${state.organizationInfo?.state || "UF"} ${state.organizationInfo?.zip || "00000-000"}</div>
          <div>Fone: ${state.organizationInfo?.phone || "(00) 0000-0000"}</div>
        </div>

        <!-- Divisor -->
        <div style="border-top: 2px dashed #000; margin: 4mm 0;"></div>

        <!-- Destinatário -->
        <div style="font-size: 10pt; margin-bottom: 6mm;">
          <strong>DESTINATÁRIO</strong>
          <div>${html(order.client || "Cliente")}</div>
          <div>${html(order.address_street || "Rua")} ${order.address_number || "0"}</div>
          <div>${order.address_complement ? html(order.address_complement) : ""}</div>
          <div>${html(order.address_neighborhood || "Bairro")}</div>
          <div>
            ${html(order.address_city || "Cidade")} - ${order.address_state || "UF"}
            ${order.address_zip || "00000-000"}
          </div>
          <div style="margin-top: 2mm;">
            ${order.client_phone ? `Fone: ${order.client_phone}` : ""}
          </div>
        </div>

        <!-- Informações do objeto -->
        <div style="border: 1px solid #000; padding: 4mm; font-size: 9pt; margin-bottom: 6mm;">
          <strong>INFORMAÇÕES DO OBJETO</strong>
          <div>Número: <strong>${order.id}</strong></div>
          <div>Peso: ${order.weight || "Não informado"} kg</div>
          <div>Valor: <strong>${money.format(order.charged || 0)}</strong></div>
          <div style="margin-top: 2mm;">
            Descrição: ${html(order.description || "Produto")}
          </div>
        </div>

        <!-- Código de barras (simplificado) -->
        <div style="text-align: center; margin-bottom: 6mm;">
          <div style="font-size: 8pt; letter-spacing: 2px; font-weight: bold;">
            ${order.id.substring(0, 13).padEnd(13, "0")}
          </div>
        </div>

        <!-- Aviso de conteúdo -->
        <div style="border: 1px solid #000; padding: 3mm; font-size: 8pt; margin-bottom: 6mm;">
          <strong>DECLARAÇÃO DE CONTEÚDO</strong>
          <div>Este objeto contém: ${html(order.description || "Produto")}</div>
          <div>Valor declarado: ${money.format(order.charged || 0)}</div>
          <div>Data: ${now.toLocaleDateString("pt-BR")}</div>
        </div>

        <!-- Observações -->
        <div style="font-size: 8pt;">
          <strong>OBSERVAÇÕES:</strong>
          <div>${html(order.notes || "Nenhuma observação")}</div>
        </div>
      </div>

      <!-- PÁGINA 2: COMPROVANTE DE ENTREGA -->
      <div style="
        width: 105mm;
        height: 148mm;
        border: 2px solid #000;
        padding: 8mm;
        page-break-after: always;
      ">
        <div style="text-align: center; margin-bottom: 8mm;">
          <strong style="font-size: 14pt;">COMPROVANTE DO REMETENTE</strong>
        </div>

        <div style="font-size: 10pt; line-height: 1.8;">
          <div><strong>Número do objeto:</strong> ${order.id}</div>
          <div><strong>Destinatário:</strong> ${html(order.client || "Cliente")}</div>
          <div><strong>Cidade destino:</strong> ${html(order.address_city || "Cidade")}</div>
          <div><strong>Valor:</strong> ${money.format(order.charged || 0)}</div>
          <div><strong>Data de postagem:</strong> ${now.toLocaleDateString("pt-BR")}</div>
          <div style="margin-top: 8mm; padding: 4mm; border: 1px solid #000;">
            <strong>Assinatura do Remetente:</strong>
            <div style="height: 20mm;"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function editOrderAddress(orderId) {
  const order = state.data?.orders?.find(o => o.id === orderId);
  if (!order) return;

  const modal = document.createElement("div");
  modal.className = "address-modal";
  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-content address-form">
      <div class="modal-header">
        <h2>Endereço de Entrega</h2>
        <span class="close-btn">✕</span>
      </div>

      <div class="modal-body">
        <label>CEP
          <input type="text" id="addr-zip" placeholder="00000-000" value="${order.address_zip || ""}" />
        </label>
        <label>Rua
          <input type="text" id="addr-street" placeholder="Rua" value="${order.address_street || ""}" required />
        </label>
        <label>Número
          <input type="text" id="addr-number" placeholder="123" value="${order.address_number || ""}" required />
        </label>
        <label>Complemento
          <input type="text" id="addr-complement" placeholder="Apto, sala..." value="${order.address_complement || ""}" />
        </label>
        <label>Bairro
          <input type="text" id="addr-neighborhood" placeholder="Bairro" value="${order.address_neighborhood || ""}" required />
        </label>
        <label>Cidade
          <input type="text" id="addr-city" placeholder="Cidade" value="${order.address_city || ""}" required />
        </label>
        <label>Estado
          <select id="addr-state" required>
            <option value="">Selecione...</option>
            ${["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]
              .map(st => `<option value="${st}" ${order.address_state === st ? "selected" : ""}>${st}</option>`)
              .join("")}
          </select>
        </label>
        <label>Telefone
          <input type="tel" id="addr-phone" placeholder="(00) 99999-9999" value="${order.client_phone || ""}" />
        </label>
      </div>

      <div class="modal-actions">
        <button class="primary-btn" id="save-address">Salvar</button>
        <button class="secondary-btn" id="cancel-address">Cancelar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("#save-address").addEventListener("click", () => {
    order.address_zip = modal.querySelector("#addr-zip").value;
    order.address_street = modal.querySelector("#addr-street").value;
    order.address_number = modal.querySelector("#addr-number").value;
    order.address_complement = modal.querySelector("#addr-complement").value;
    order.address_neighborhood = modal.querySelector("#addr-neighborhood").value;
    order.address_city = modal.querySelector("#addr-city").value;
    order.address_state = modal.querySelector("#addr-state").value;
    order.client_phone = modal.querySelector("#addr-phone").value;

    modal.remove();
    generateShippingLabel(orderId);
  });

  modal.querySelector("#cancel-address").addEventListener("click", () => modal.remove());
  modal.querySelector(".close-btn").addEventListener("click", () => modal.remove());
}

export function showShippingLabelButton(order) {
  // Mostrar botão apenas para vendas diretas (não marketplace)
  if (order.source === "marketplace" || order.marketplaceOrderCode) {
    return "";
  }

  return `
    <button class="secondary-btn" data-shipping-label="${html(order.id)}" type="button" title="Gerar etiqueta">
      📦 Gerar Etiqueta
    </button>
  `;
}

if (!window.__flowOpsShippingActionsBound) {
  window.__flowOpsShippingActionsBound = true;
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-shipping-label]");
    if (button) generateShippingLabel(button.dataset.shippingLabel);
  });
}
