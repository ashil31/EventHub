/**
 * Identical shape for both paginated endpoints (events and attendees —
 * see backend's PaginationMetaDto and AttendeesPaginationMetaDto, which
 * are structurally the same type declared twice on the backend). One
 * frontend type for both.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}
