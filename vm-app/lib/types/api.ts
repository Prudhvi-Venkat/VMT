/**
 * Generic API envelopes and pagination models.
 */

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    requestId?: string;
    details?: Record<string, unknown>;
  };
}
