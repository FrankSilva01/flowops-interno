function positiveInteger(value, fallback) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function paginate(items, requestedPage = 1, requestedPageSize = 10) {
  const collection = Array.isArray(items) ? items : [];
  const pageSize = positiveInteger(requestedPageSize, 10);
  const total = collection.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(positiveInteger(requestedPage, 1), pageCount);
  const offset = (page - 1) * pageSize;
  const visible = collection.slice(offset, offset + pageSize);
  return {
    items: visible,
    page,
    pageSize,
    pageCount,
    total,
    start: total ? offset + 1 : 0,
    end: total ? offset + visible.length : 0,
  };
}

export function responsivePageSize(viewportHeight, normalSize = 10, compactSize = 5, compactBreakpoint = 820) {
  const height = Number(viewportHeight);
  return Number.isFinite(height) && height < compactBreakpoint ? compactSize : normalSize;
}
