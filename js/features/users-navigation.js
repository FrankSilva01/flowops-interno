export const USER_MANAGEMENT_SECTIONS = Object.freeze(["users", "responsibles", "approvals"]);

export function userManagementSectionForKey(currentSection, key) {
  const currentIndex = USER_MANAGEMENT_SECTIONS.indexOf(currentSection);
  const index = currentIndex < 0 ? 0 : currentIndex;
  if (key === "Home") return USER_MANAGEMENT_SECTIONS[0];
  if (key === "End") return USER_MANAGEMENT_SECTIONS.at(-1);
  if (key === "ArrowRight") return USER_MANAGEMENT_SECTIONS[(index + 1) % USER_MANAGEMENT_SECTIONS.length];
  if (key === "ArrowLeft") return USER_MANAGEMENT_SECTIONS[(index - 1 + USER_MANAGEMENT_SECTIONS.length) % USER_MANAGEMENT_SECTIONS.length];
  return null;
}

export function paginateUserManagementRows(rows = [], requestedPage = 1, pageSize = 8) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(requestedPage) || 1), pages);
  const start = (page - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), page, pages, total };
}
