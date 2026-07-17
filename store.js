const STORE_ENDPOINT = `${window.SUPABASE_CONFIG.SUPABASE_URL}/functions/v1/storefront`;
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const state = {
  supabase: null,
  products: [],
  query: "",
  category: "all",
  selectedImage: "",
  adminSession: null,
  uploadedImages: [],
  carouselIndex: 0,
  carouselTimer: null,
  detailProduct: null,
  detailImageIndex: 0,
  touchStartX: 0,
  sessionId: getStoreSessionId(),
};

document.addEventListener("DOMContentLoaded", async () => {
  bindStoreEvents();
  await loadSupabase();
  state.supabase = window.supabase.createClient(
    window.SUPABASE_CONFIG.SUPABASE_URL,
    window.SUPABASE_CONFIG.SUPABASE_ANON_KEY,
  );
  await loadProducts();
  route();
});

window.addEventListener("hashchange", route);

function bindStoreEvents() {
  byId("storeSearch").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderCatalog();
  });
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category || "all";
      document.querySelectorAll(".nav-chip").forEach((item) => item.classList.toggle("active", item === button));
      showStoreSection("home");
      renderCatalog();
    });
  });
  document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-chip").forEach((item) => item.classList.toggle("active", item === button));
      showStoreSection(button.dataset.section);
    });
  });
  document.querySelectorAll("[data-footer-section]").forEach((button) => {
    button.addEventListener("click", () => showStoreSection(button.dataset.footerSection));
  });
  byId("customQuoteForm").addEventListener("submit", submitCustomQuote);
  byId("backToCatalogBtn").addEventListener("click", () => {
    window.location.hash = "";
  });
  byId("heroPrevBtn").addEventListener("click", () => moveCarousel(-1));
  byId("heroNextBtn").addEventListener("click", () => moveCarousel(1));
  byId("adminOpenBtn").addEventListener("click", () => byId("adminDialog").showModal());
  byId("adminCloseBtn").addEventListener("click", () => byId("adminDialog").close());
  byId("adminLoginForm").addEventListener("submit", adminLogin);
  byId("productForm").addEventListener("submit", saveProduct);
  byId("productImages").addEventListener("change", handleImageUpload);
}

async function loadProducts() {
  const response = await fetch(STORE_ENDPOINT);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Falha ao carregar vitrine.");
  state.products = data.products || [];
  renderCarousel();
  renderCatalog();
  renderAdminProducts();
  renderAdminStats();
}

function renderCarousel() {
  const featured = state.products.filter((item) => item.image_url).slice(0, 8);
  const slides = byId("heroSlides");
  if (!featured.length) {
    slides.innerHTML = `<div class="hero-empty">Produtos em destaque aparecem aqui.</div>`;
    return;
  }
  slides.innerHTML = featured.map((item, index) => `
    <button class="hero-slide ${index === state.carouselIndex ? "active" : ""}" type="button" data-product="${html(productKey(item))}">
      <img src="${html(item.image_url)}" alt="${html(item.title)}" />
      <span>${html(item.marketplace)}</span>
      <strong>${html(item.title)}</strong>
      <em>${money.format(Number(item.price || 0))}</em>
    </button>
  `).join("");
  document.querySelectorAll(".hero-slide").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.hash = `produto/${encodeURIComponent(button.dataset.product)}`;
    });
  });
  window.clearInterval(state.carouselTimer);
  state.carouselTimer = window.setInterval(() => moveCarousel(1), 5200);
}

function moveCarousel(delta) {
  const featuredCount = state.products.filter((item) => item.image_url).slice(0, 8).length;
  if (!featuredCount) return;
  state.carouselIndex = (state.carouselIndex + delta + featuredCount) % featuredCount;
  renderCarousel();
}

function renderCatalog() {
  const rows = filteredProducts();
  byId("productCount").textContent = `${rows.length} produto${rows.length === 1 ? "" : "s"}`;
  byId("productGrid").innerHTML = rows.length ? rows.map((item) => `
    <button class="product-card" type="button" data-product="${html(productKey(item))}">
      <img src="${html(item.image_url || fallbackImage())}" alt="${html(item.title)}" loading="lazy" />
      <span class="marketplace-pill ${channelClass(item.marketplace)}">${html(item.marketplace)}</span>
      <strong>${html(item.title)}</strong>
      <span class="price">${money.format(Number(item.price || 0))}</span>
      <span class="payment-note">${html(item.payment_note || "")}</span>
    </button>
  `).join("") : `<div class="empty-state">Nenhum produto encontrado.</div>`;
  document.querySelectorAll("[data-product]").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.hash = `produto/${encodeURIComponent(button.dataset.product)}`;
    });
  });
}

function filteredProducts() {
  return state.products
    .filter((item) => state.category === "all" || categoryMatches(item, state.category))
    .filter((item) => {
      if (!state.query) return true;
      return [item.title, item.description, item.category, item.marketplace].some((value) =>
        String(value || "").toLowerCase().includes(state.query)
      );
    });
}

function route() {
  const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  if (!hash.startsWith("produto/")) {
    showStoreSection("home", false);
    return;
  }
  const key = hash.replace("produto/", "");
  const product = state.products.find((item) => productKey(item) === key);
  if (!product) {
    window.location.hash = "";
    return;
  }
  renderDetail(product);
}

function showStoreSection(section, clearHash = true) {
  ["homeView", "detailView", "customView", "aboutView", "faqView"].forEach((id) => {
    byId(id).hidden = true;
  });
  if (section === "custom") byId("customView").hidden = false;
  else if (section === "about") byId("aboutView").hidden = false;
  else if (section === "faq") byId("faqView").hidden = false;
  else byId("homeView").hidden = false;
  if (section === "home") updateStoreSeo();
  if (clearHash && window.location.hash) history.pushState(null, "", window.location.pathname);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function categoryMatches(item, category) {
  const needle = normalizeCategory(category);
  return normalizeCategory(inferStoreCategory(item)) === needle;
}

function inferStoreCategory(item) {
  const text = normalizeCategory(`${item.category || ""} ${item.title || ""} ${item.description || ""} ${item.raw_payload?.domain_id || ""}`);
  if (/funko|pop vinyl|boneco pop/.test(text)) return "Funko";
  if (/miniatura|miniature|rpg|d&d|dungeons|pathfinder|wargame|32mm|28mm/.test(text)) return "Miniaturas RPG";
  if (/suporte|organizador|utilidade|ferramenta|chaveiro|porta |peca funcional/.test(text)) return "Utilidades";
  if (/decoracao|decora|diorama|luminaria|vaso|quadro|estatua/.test(text)) return "Decoracao";
  if (/action|figure|boneco|pokemon|dragonite|mewtwo|deadpool|anime|estatueta/.test(text)) return "Action Figures";
  return item.category || "Decoracao";
}

function renderDetail(product) {
  state.detailProduct = product;
  state.detailImageIndex = 0;
  const images = productImages(product);
  state.selectedImage = images[0];
  const buyLinks = productBuyLinks(product);
  updateStoreSeo(product);
  trackStoreEvent("product_view", product);
  byId("homeView").hidden = true;
  byId("detailView").hidden = false;
  byId("productDetail").innerHTML = `
    <article class="product-detail">
      <div class="gallery">
        <div class="thumbs">
          ${images.slice(0, 8).map((url, index) => `
            <button class="${index === 0 ? "active" : ""}" type="button" data-image="${html(url)}">
              <img src="${html(url)}" alt="${html(product.title)} ${index + 1}" />
            </button>
          `).join("")}
        </div>
        <div>
          <button class="main-image" id="mainImageButton" type="button" aria-label="Clique para ampliar">
            <img id="mainProductImage" src="${html(state.selectedImage)}" alt="${html(product.title)}" />
            <span class="zoom-hint">Clique para ampliar</span>
          </button>
          <div class="gallery-controls">
            <button type="button" data-gallery-prev>Anterior</button>
            <strong id="photoCounter">1 / ${images.length}</strong>
            <button type="button" data-gallery-next>Proxima</button>
          </div>
        </div>
      </div>
      <aside class="buy-box">
        <span class="marketplace-pill ${channelClass(product.marketplace)}">${html(productSourceLabel(product))}</span>
        <h1>${html(product.title)}</h1>
        <span class="code">Codigo: ${html(product.external_id || product.sku || "-")}</span>
        <span class="price">${money.format(Number(product.price || 0))}</span>
        <span class="payment-note">${html(product.payment_note || "")}</span>
        ${renderSalesAndRating(product)}
        ${renderTechBadges(product)}
        ${renderAvailability(product)}
        ${product.delivery_note ? `<p class="delivery-note">${html(product.delivery_note)}</p>` : ""}
        ${product.free_shipping ? `<span class="marketplace-pill vitrine">Frete gratis conforme anuncio</span>` : ""}
        <div class="buy-actions">${buyLinks.map((link) => `
          <a class="buy-button ${link.kind}" data-buy-kind="${html(link.kind)}" href="${html(link.url)}" target="_blank" rel="noopener">${html(link.label)}</a>
        `).join("")}</div>
        <p class="redirect-note">${buyLinks.some((link) => link.kind !== "quote")
          ? "Voce sera redirecionado para o marketplace para finalizar a compra com seguranca."
          : "Produto demonstrativo. Solicite orcamento para verificar prazo e disponibilidade."}</p>
      </aside>
      <section class="description">
        <h2>Descricao do produto</h2>
        <div class="description-content">${renderDescription(product)}</div>
      </section>
      ${renderReviews(product)}
      ${renderRelatedProducts(product)}
    </article>
  `;
  document.querySelectorAll("[data-image]").forEach((button) => {
    button.addEventListener("click", () => {
      setDetailImage(images.indexOf(button.dataset.image));
    });
  });
  byId("mainImageButton").addEventListener("click", openImageZoom);
  byId("mainImageButton").addEventListener("mousemove", handleImageHoverZoom);
  byId("mainImageButton").addEventListener("mouseleave", resetImageHoverZoom);
  byId("mainImageButton").addEventListener("touchstart", (event) => {
    state.touchStartX = event.touches[0]?.clientX || 0;
  }, { passive: true });
  byId("mainImageButton").addEventListener("touchend", (event) => {
    const endX = event.changedTouches[0]?.clientX || 0;
    if (Math.abs(endX - state.touchStartX) < 35) return;
    setDetailImage(state.detailImageIndex + (endX < state.touchStartX ? 1 : -1));
  }, { passive: true });
  document.querySelector("[data-gallery-prev]").addEventListener("click", () => setDetailImage(state.detailImageIndex - 1));
  document.querySelector("[data-gallery-next]").addEventListener("click", () => setDetailImage(state.detailImageIndex + 1));
  document.querySelectorAll("[data-related-product]").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.hash = `produto/${encodeURIComponent(button.dataset.relatedProduct)}`;
    });
  });
  document.querySelectorAll("[data-buy-kind]").forEach((link) => {
    link.addEventListener("click", () => {
      trackStoreEvent(link.dataset.buyKind === "quote" ? "quote_click" : "buy_click", product, { destination: link.href });
    });
  });
}

function updateStoreSeo(product = null) {
  const title = product ? `${product.title} | 3D.AFT Store` : "3D.AFT Store";
  const description = product
    ? String(product.description || "Produto em impressão 3D disponível na 3D.AFT Store.").slice(0, 155)
    : "Miniaturas, action figures, decoração e peças personalizadas produzidas em impressão 3D pela 3D.AFT.";
  document.title = title;
  setMeta("meta[name='description']", description);
  setMeta("meta[property='og:title']", title);
  setMeta("meta[property='og:description']", description);
  setMeta("meta[property='og:image']", product?.image_url || "https://rainbow-lokum-1fad14.netlify.app/assets/logo-3daft.jpg");
}

function setMeta(selector, content) {
  const node = document.querySelector(selector);
  if (node) node.setAttribute("content", content);
}

function productImages(product) {
  const images = [...new Set([...(product.images || []), product.image_url].filter(Boolean))];
  return images.length ? images : [fallbackImage()];
}

function setDetailImage(index) {
  const images = productImages(state.detailProduct);
  state.detailImageIndex = (index + images.length) % images.length;
  state.selectedImage = images[state.detailImageIndex];
  byId("mainProductImage").src = state.selectedImage;
  byId("photoCounter").textContent = `${state.detailImageIndex + 1} / ${images.length}`;
  document.querySelectorAll("[data-image]").forEach((button) => {
    button.classList.toggle("active", button.dataset.image === state.selectedImage);
  });
  resetImageHoverZoom();
}

function handleImageHoverZoom(event) {
  const img = byId("mainProductImage");
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  img.style.transformOrigin = `${x}% ${y}%`;
  img.style.transform = "scale(1.8)";
}

function resetImageHoverZoom() {
  const img = byId("mainProductImage");
  if (!img) return;
  img.style.transformOrigin = "center";
  img.style.transform = "scale(1)";
}

function openImageZoom() {
  const images = productImages(state.detailProduct);
  const dialog = document.createElement("dialog");
  dialog.className = "zoom-dialog";
  dialog.innerHTML = `
    <button class="zoom-close" type="button">Fechar</button>
    <button class="zoom-nav prev" type="button">&lsaquo;</button>
    <img src="${html(state.selectedImage)}" alt="${html(state.detailProduct.title)}" />
    <button class="zoom-nav next" type="button">&rsaquo;</button>
    <strong>${state.detailImageIndex + 1} / ${images.length}</strong>
  `;
  const update = (delta) => {
    setDetailImage(state.detailImageIndex + delta);
    dialog.querySelector("img").src = state.selectedImage;
    dialog.querySelector("strong").textContent = `${state.detailImageIndex + 1} / ${images.length}`;
  };
  dialog.querySelector(".zoom-close").addEventListener("click", () => dialog.close());
  dialog.querySelector(".prev").addEventListener("click", () => update(-1));
  dialog.querySelector(".next").addEventListener("click", () => update(1));
  dialog.addEventListener("close", () => dialog.remove());
  document.body.appendChild(dialog);
  dialog.showModal();
}

function renderDescription(product) {
  const rich = product.raw_payload?.description_html || "";
  if (rich) return sanitizeRichDescription(rich);
  const text = product.description || "Confira as informacoes completas no anuncio do marketplace.";
  return text
    .split(/\n{2,}|(?=ESPECIFICAÇÕES|IMPORTANTE|CONTEÚDO|Conteudo|Material:)/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${html(part)}</p>`)
    .join("");
}

function sanitizeRichDescription(value) {
  const template = document.createElement("template");
  template.innerHTML = String(value || "");
  template.content.querySelectorAll("script,style,iframe,object,embed").forEach((item) => item.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attr) => {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
      if (attr.name === "href" && !/^https?:|^mailto:|^tel:/i.test(attr.value)) node.removeAttribute(attr.name);
      if (attr.name === "src" && !/^https?:|^data:image\//i.test(attr.value)) node.removeAttribute(attr.name);
    });
  });
  return template.innerHTML;
}

function renderTechBadges(product) {
  const tech = product.raw_payload?.technical_info || {};
  const attrText = JSON.stringify(product.raw_payload?.attributes || []);
  const material = tech.material || (/Resina/i.test(product.title + attrText) ? "Resina 8K" : "");
  const height = tech.height || product.raw_payload?.attributes?.find?.((item) => /height|altura/i.test(item.id || item.name || ""))?.value_name || "";
  const painting = tech.painting || (/pintad/i.test(product.title) ? "Pintado" : "");
  const tags = [material, height, painting, tech.assembly].filter(Boolean);
  return tags.length ? `<div class="tech-badges">${tags.map((tag) => `<span>${html(tag)}</span>`).join("")}</div>` : "";
}

function renderAvailability(product) {
  const qty = Number(product.available_quantity || product.raw_payload?.available_quantity || 0);
  const label = qty <= 0 ? "Sob encomenda" : qty === 1 ? "Ultima unidade" : "Em estoque";
  const cls = qty <= 0 ? "made-to-order" : qty === 1 ? "last-unit" : "in-stock";
  return `<span class="availability ${cls}">${label}</span>`;
}

function productSourceLabel(product) {
  if (normalizeCategory(product.marketplace).includes("mercado")) return "Vendido pelo Mercado Livre";
  if (normalizeCategory(product.marketplace).includes("shopee")) return "Vendido pela Shopee";
  if (normalizeCategory(product.marketplace).includes("amazon")) return "Vendido pela Amazon";
  return "Produto da vitrine";
}

function productBuyLinks(product) {
  const payload = product.raw_payload || {};
  const links = [];
  const mlUrl = product.buy_links?.mercado_livre || product.marketplace_url;
  const shopeeUrl = product.buy_links?.shopee || payload.shopee_url;
  const amazonUrl = product.buy_links?.amazon || payload.amazon_url;
  const hasMarketplace = Boolean(mlUrl || shopeeUrl || amazonUrl || product.marketplace_url);
  const storeOnly = !hasMarketplace;
  if (mlUrl && normalizeCategory(product.marketplace).includes("mercado")) {
    links.push({ label: "Comprar no Mercado Livre", url: mlUrl, kind: "ml" });
  } else if (product.marketplace_url) {
    links.push({ label: `Comprar em ${product.marketplace}`, url: product.marketplace_url, kind: "marketplace" });
  }
  if (shopeeUrl) links.push({ label: "Comprar na Shopee", url: shopeeUrl, kind: "shopee" });
  if (amazonUrl) links.push({ label: "Comprar na Amazon", url: amazonUrl, kind: "amazon" });
  const whatsapp = product.buy_links?.whatsapp || payload.whatsapp_url || "https://wa.me/5511967617077";
  if (storeOnly) {
    links.push({ label: "Solicitar orcamento", url: whatsapp, kind: "quote" });
  }
  return links;
}

function renderSalesAndRating(product) {
  const sold = Number(product.sold_quantity || 0);
  const rating = Number(product.rating_average || 0);
  const count = Number(product.rating_count || product.reviews?.length || 0);
  if (!sold && !count) return "";
  return `<div class="product-social-proof">
    ${sold ? `<span><strong>${sold.toLocaleString("pt-BR")}</strong> vendido${sold === 1 ? "" : "s"}</span>` : ""}
    ${count ? `<span><strong>${rating.toFixed(1)} ★</strong> ${count} avaliacao${count === 1 ? "" : "oes"}</span>` : ""}
  </div>`;
}

function renderReviews(product) {
  const reviews = Array.isArray(product.reviews) ? product.reviews.slice(0, 6) : [];
  if (!reviews.length) return "";
  return `<section class="product-reviews">
    <div class="section-heading">
      <h2>Avaliacoes de clientes</h2>
      <span>${Number(product.rating_average || 0).toFixed(1)} ★ • ${product.rating_count || reviews.length} opinioes</span>
    </div>
    <div class="review-grid">${reviews.map((review) => `
      <article>
        <strong>${"★".repeat(Math.max(1, Math.round(Number(review.rating || 0))))}</strong>
        ${review.title ? `<h3>${html(review.title)}</h3>` : ""}
        <p>${html(review.comment || "Avaliacao registrada no marketplace.")}</p>
        <small>${html(review.author_name || review.marketplace || "Cliente verificado")}</small>
      </article>
    `).join("")}</div>
  </section>`;
}

function renderRelatedProducts(product) {
  const related = state.products
    .filter((item) => productKey(item) !== productKey(product))
    .filter((item) => normalizeCategory(item.category) === normalizeCategory(product.category) || item.marketplace === product.marketplace)
    .slice(0, 4);
  if (!related.length) return "";
  return `
    <section class="related-products">
      <h2>Voce tambem pode gostar</h2>
      <div class="related-grid">
        ${related.map((item) => `
          <button type="button" data-related-product="${html(productKey(item))}">
            <img src="${html(item.image_url || fallbackImage())}" alt="${html(item.title)}" />
            <strong>${html(item.title)}</strong>
            <span>${money.format(Number(item.price || 0))}</span>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

async function submitCustomQuote(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const message = byId("customQuoteMessage");
  message.textContent = "Enviando solicitacao...";
  try {
    const imageFiles = Array.from(form.elements.image_files.files || []).slice(0, 4);
    const stlFile = form.elements.stl_file.files?.[0] || null;
    const payload = {
      action: "custom-quote",
      session_id: state.sessionId,
      name: String(data.get("name") || "").trim(),
      email: String(data.get("email") || "").trim(),
      whatsapp: String(data.get("whatsapp") || "").trim(),
      description: String(data.get("description") || "").trim(),
      desired_size: String(data.get("desired_size") || "").trim(),
      material: String(data.get("material") || "").trim(),
      stl_file: await readQuoteAttachment(stlFile),
      images: (await Promise.all(imageFiles.map(readQuoteImage))).filter(Boolean),
    };
    const response = await fetch(STORE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Nao foi possivel enviar a solicitacao.");
    message.textContent = `Solicitacao enviada. Pedido interno: ${result.order_code || result.order_id}.`;
    form.reset();
  } catch (error) {
    message.textContent = error.message;
  }
}

async function readQuoteImage(file) {
  if (!file?.type?.startsWith("image/")) return null;
  try {
    return {
      name: file.name,
      size: file.size,
      type: file.type,
      data_url: await resizeImageFile(file),
    };
  } catch {
    return null;
  }
}

function readQuoteAttachment(file) {
  if (!file) return Promise.resolve(null);
  if (file.size > 5 * 1024 * 1024) {
    return Promise.resolve({
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      warning: "Arquivo acima de 5 MB. Solicitar envio pelo WhatsApp.",
    });
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve({
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      warning: "Nao foi possivel anexar o arquivo.",
    });
    reader.onload = () => resolve({
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      data_url: String(reader.result || ""),
    });
    reader.readAsDataURL(file);
  });
}

async function adminLogin(event) {
  event.preventDefault();
  const loginForm = event.currentTarget;
  const form = new FormData(loginForm);
  const message = byId("adminLoginMessage");
  message.textContent = "Entrando...";
  const { data, error } = await state.supabase.auth.signInWithPassword({
    email: String(form.get("email") || "").trim(),
    password: String(form.get("password") || ""),
  });
  if (error) {
    message.textContent = "Login invalido.";
    return;
  }
  state.adminSession = data.session;
  message.textContent = "";
  loginForm.hidden = true;
  byId("adminPanel").hidden = false;
  renderAdminProducts();
  renderAdminStats();
}

async function handleImageUpload(event) {
  const files = Array.from(event.currentTarget.files || []);
  state.uploadedImages = [];
  if (!files.length) return;
  const message = byId("productFormMessage");
  message.textContent = "Preparando imagens...";
  state.uploadedImages = await Promise.all(files.slice(0, 6).map(resizeImageFile));
  message.textContent = `${state.uploadedImages.length} imagem(ns) pronta(s) para salvar.`;
}

async function saveProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const payload = Object.fromEntries(data.entries());
  payload.featured = data.get("featured") === "on";
  payload.image_urls = [
    ...String(payload.image_url || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    ...state.uploadedImages,
  ];
  const message = byId("productFormMessage");
  message.textContent = "Salvando...";
  try {
    await adminRequest({ action: "save", ...payload });
    message.textContent = payload.publish_target === "mercado_livre_draft"
      ? "Produto salvo na vitrine e marcado para preparar publicacao no Mercado Livre."
      : "Produto salvo.";
    state.uploadedImages = [];
    form.reset();
    form.elements.marketplace.value = "Vitrine";
    form.elements.publish_target.value = "storefront";
    form.elements.category.value = "Action figures";
    await loadProducts();
  } catch (error) {
    message.textContent = error.message;
  }
}

async function adminRequest(payload) {
  if (!state.adminSession?.access_token) throw new Error("Entre como administrador.");
  const response = await fetch(STORE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: window.SUPABASE_CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${state.adminSession.access_token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Falha ao salvar.");
  return data;
}

function renderAdminStats() {
  const stats = byId("adminStats");
  if (!stats || byId("adminPanel").hidden) return;
  const byMarketplace = state.products.reduce((acc, item) => {
    acc[item.marketplace] = (acc[item.marketplace] || 0) + 1;
    return acc;
  }, {});
  const synced = state.products.filter((item) => item.marketplace !== "Vitrine").length;
  const manual = state.products.length - synced;
  stats.innerHTML = `
    <div><strong>${state.products.length}</strong><span>Produtos na vitrine</span></div>
    <div><strong>${synced}</strong><span>Produtos sincronizados</span></div>
    <div><strong>${manual}</strong><span>Produtos manuais</span></div>
    <div><strong>${Object.entries(byMarketplace).map(([name, count]) => `${html(name)}: ${count}`).join(" | ") || "-"}</strong><span>Origem dos produtos</span></div>
  `;
}

function renderAdminProducts() {
  const list = byId("adminProductList");
  if (!list || byId("adminPanel").hidden) return;
  list.innerHTML = state.products.map((item) => `
    <div class="admin-product-row">
      <img src="${html(item.image_url || fallbackImage())}" alt="${html(item.title)}" />
      <div>
        <strong>${html(item.title)}</strong>
        <span>${html(item.marketplace)} - ${money.format(Number(item.price || 0))}</span>
      </div>
      <button type="button" data-edit="${html(productKey(item))}">Editar</button>
    </div>
  `).join("");
  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => fillProductForm(state.products.find((item) => productKey(item) === button.dataset.edit)));
  });
}

function fillProductForm(product) {
  if (!product) return;
  const form = byId("productForm");
  form.elements.marketplace.value = product.marketplace || "Vitrine";
  form.elements.publish_target.value = product.raw_payload?.publish_target || "storefront";
  form.elements.external_id.value = product.external_id || "";
  form.elements.title.value = product.title || "";
  form.elements.category.value = product.category || "";
  form.elements.price.value = Number(product.price || 0);
  form.elements.marketplace_url.value = product.marketplace_url || "";
  form.elements.image_url.value = (product.images || []).join("\n");
  form.elements.description.value = product.description || "";
  form.elements.payment_note.value = product.payment_note || "";
  form.elements.delivery_note.value = product.delivery_note || "";
  form.elements.featured.checked = Boolean(product.featured);
  state.uploadedImages = [];
}

function loadSupabase() {
  if (window.supabase) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@supabase/supabase-js@2";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Nao foi possivel carregar Supabase."));
    document.head.appendChild(script);
  });
}

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Imagem invalida."));
      image.onload = () => {
        const maxSide = 1200;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function productKey(item) {
  return `${item.marketplace}:${item.external_id}`;
}

function normalizeCategory(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function channelClass(value) {
  const key = normalizeCategory(value);
  if (key.includes("shopee")) return "shopee";
  if (key.includes("vitrine")) return "vitrine";
  return "";
}

function fallbackImage() {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'%3E%3Crect width='600' height='600' fill='%23f3f5f7'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23667085' font-family='Arial' font-size='26'%3E3D.AFT%3C/text%3E%3C/svg%3E";
}

function getStoreSessionId() {
  const key = "3daft-store-session";
  let value = sessionStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    sessionStorage.setItem(key, value);
  }
  return value;
}

function trackStoreEvent(eventType, product, metadata = {}) {
  fetch(STORE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "track-event",
      event_type: eventType,
      product_id: productKey(product),
      marketplace: product.marketplace || "",
      session_id: state.sessionId,
      metadata,
    }),
  }).catch(() => {});
}

function html(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function byId(id) {
  return document.getElementById(id);
}
