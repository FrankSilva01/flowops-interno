import { byId, html } from "./dom.js";
import { money } from "./state.js";

export function renderBarChart(elementId, rows) {
  const target = byId(elementId);
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = `<div class="empty-chart">Sem dados</div>`;
    return;
  }
  const max = Math.max(...rows.map((item) => Number(item.value || 0)), 1);
  target.innerHTML = rows.map((item) => {
    const value = Number(item.value || 0);
    const width = Math.max((value / max) * 100, value > 0 ? 4 : 0);
    const formatter = item.format || ((number) => number.toLocaleString("pt-BR"));
    return `
      <div class="chart-row" title="${html(item.label)}: ${html(formatter(value))}">
        <div class="chart-meta">
          <span>${html(item.label)}</span>
          <strong>${html(formatter(value))}</strong>
        </div>
        <div class="chart-track">
          <div class="chart-fill" style="width:${width}%; background:${item.color || "var(--teal)"}"></div>
        </div>
      </div>
    `;
  }).join("");
}

export function renderLineChart(elementId, rows, options = {}) {
  const target = byId(elementId);
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = `<div class="empty-chart">Sem dados</div>`;
    return;
  }
  const values = rows.map((item) => Number(item.value || 0));
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const width = 620;
  const height = 190;
  const left = 46;
  const right = 18;
  const top = 18;
  const bottom = 38;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const points = rows.map((item, index) => {
    const x = left + (rows.length === 1 ? plotW / 2 : (index / (rows.length - 1)) * plotW);
    const y = top + plotH - ((Number(item.value || 0) - min) / range) * plotH;
    return { x, y, item };
  });
  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${left},${top + plotH} ${line} ${left + plotW},${top + plotH}`;
  const formatter = options.format || ((number) => money.format(number));
  const ticks = [max, min].map((value) => `<text x="0" y="${(top + plotH - ((value - min) / range) * plotH).toFixed(1)}" class="line-chart-axis">${html(formatter(value))}</text>`).join("");
  target.innerHTML = `<div class="line-chart-wrap">
    <div class="chart-hover-tooltip" hidden></div>
    <svg class="line-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${html(options.valueLabel || "Evolução")}">
      <defs>
        <linearGradient id="${elementId}Gradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--teal)" stop-opacity=".38" />
          <stop offset="100%" stop-color="var(--teal)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <line x1="${left}" y1="${top + plotH}" x2="${left + plotW}" y2="${top + plotH}" class="line-chart-grid" />
      <line x1="${left}" y1="${top + plotH / 2}" x2="${left + plotW}" y2="${top + plotH / 2}" class="line-chart-grid" />
      ${ticks}
      <polygon points="${area}" fill="url(#${elementId}Gradient)" />
      <polyline points="${line}" class="line-chart-line" />
      ${points.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="6" class="line-chart-dot" tabindex="0" data-chart-label="${html(point.item.label)}" data-chart-value="${html(formatter(point.item.value || 0))}" data-chart-x="${point.x}" data-chart-y="${point.y}"><title>${html(point.item.label)}: ${html(formatter(point.item.value || 0))}</title></circle>`).join("")}
      ${points.map((point, index) => index % Math.ceil(rows.length / 6 || 1) === 0 ? `<text x="${point.x.toFixed(1)}" y="${height - 10}" text-anchor="middle" class="line-chart-label">${html(point.item.label)}</text>` : "").join("")}
    </svg>
  </div>`;
  const tooltip = target.querySelector(".chart-hover-tooltip");
  target.querySelectorAll("[data-chart-label]").forEach((point) => {
    const show = () => {
      tooltip.innerHTML = `<strong>${html(point.dataset.chartLabel)}</strong><span>${html(point.dataset.chartValue)}</span>`;
      tooltip.style.left = `${(Number(point.dataset.chartX) / width) * 100}%`;
      tooltip.style.top = `${(Number(point.dataset.chartY) / height) * 100}%`;
      tooltip.hidden = false;
      point.classList.add("active");
    };
    const hide = () => {
      tooltip.hidden = true;
      point.classList.remove("active");
    };
    point.addEventListener("mouseenter", show);
    point.addEventListener("focus", show);
    point.addEventListener("mouseleave", hide);
    point.addEventListener("blur", hide);
  });
}
