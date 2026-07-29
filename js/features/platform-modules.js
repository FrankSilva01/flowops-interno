export function paginateItems(items, requestedPage = 1, requestedPageSize = 10) {
  const source = Array.isArray(items) ? items : [];
  const pageSize = Math.max(1, Number(requestedPageSize) || 10);
  const totalPages = Math.max(1, Math.ceil(source.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(requestedPage) || 1));
  const start = (page - 1) * pageSize;
  return { items: source.slice(start, start + pageSize), page, pageSize, total: source.length, totalPages };
}

