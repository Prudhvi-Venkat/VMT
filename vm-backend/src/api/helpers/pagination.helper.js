'use strict';

function parsePaginationParams(query = {}, { defaultPageSize = 50, maxPageSize = 100 } = {}) {
  const rawPage = parseInt(query.page, 10);
  const rawPageSize = parseInt(query.pageSize || query.limit, 10);
  const rawOffset = parseInt(query.offset, 10);

  const pageSize = !isNaN(rawPageSize) && rawPageSize > 0
    ? Math.min(rawPageSize, maxPageSize)
    : defaultPageSize;

  let page = 1;
  let offset = 0;

  if (!isNaN(rawOffset) && rawOffset >= 0) {
    offset = rawOffset;
    page = Math.floor(offset / pageSize) + 1;
  } else if (!isNaN(rawPage) && rawPage > 0) {
    page = rawPage;
    offset = (page - 1) * pageSize;
  }

  return {
    page,
    pageSize,
    limit: pageSize,
    offset,
    sortBy: query.sortBy || 'createdAt',
    sortOrder: query.sortOrder === 'asc' ? 'asc' : 'desc'
  };
}

function createPaginationResponse({ data = [], totalItems = 0, page = 1, pageSize = 50, limit, offset }) {
  const effectiveLimit = limit || pageSize || 50;
  const effectivePage = offset !== undefined ? Math.floor(offset / effectiveLimit) + 1 : page;
  const totalPages = Math.ceil(totalItems / effectiveLimit) || 1;

  return {
    data,
    pagination: {
      page: effectivePage,
      pageSize: effectiveLimit,
      totalItems,
      totalPages,
      hasNextPage: effectivePage < totalPages,
      hasPreviousPage: effectivePage > 1
    }
  };
}

module.exports = {
  parsePaginationParams,
  createPaginationResponse
};
