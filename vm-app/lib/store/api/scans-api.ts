import { apiSlice } from './api-slice';
import type { SbomScan, InspectComponent, InspectScanResponse, UploadScanParams, UploadScanResponse } from '@/lib/types';
import { adaptScan, type BackendScanResponse } from '@/lib/scanner-adapter';

export interface ScansQueryParams {
  active?: boolean;
  status?: string;
  projectId?: string;
  limit?: number;
  offset?: number;
  [key: string]: string | number | boolean | undefined;
}

export const scansApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getScans: builder.query<SbomScan[], ScansQueryParams | void>({
      query: (params) => {
        if (!params) return '/scans';
        const entries = Object.entries(params).filter(
          ([, value]) => value !== undefined && value !== null
        );
        const qs = entries.length
          ? new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
          : '';
        return `/scans${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (res: { items?: BackendScanResponse[] } | BackendScanResponse[]) => {
        const raw = Array.isArray(res) ? res : res?.items || [];
        return raw.map((s) => adaptScan(s));
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Scan' as const, id })),
              { type: 'Scan', id: 'LIST' },
            ]
          : [{ type: 'Scan', id: 'LIST' }],
    }),

    getScan: builder.query<SbomScan, string>({
      query: (scanId) => `/scans/${encodeURIComponent(scanId)}`,
      transformResponse: (res: { data?: BackendScanResponse } | BackendScanResponse) => {
        const raw = 'data' in res && res.data ? res.data : (res as BackendScanResponse);
        return adaptScan(raw);
      },
      providesTags: (_result, _error, id) => [{ type: 'Scan', id }],
    }),

    getScanComponents: builder.query<
      { items: InspectComponent[]; total: number },
      { scanId: string; page?: number; limit?: number; ecosystem?: string }
    >({
      query: ({ scanId, ...params }) => {
        const qs = new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        ).toString();
        return `/scans/${encodeURIComponent(scanId)}/components${qs ? `?${qs}` : ''}`;
      },
      providesTags: (_result, _error, { scanId }) => [{ type: 'Scan', id: scanId }],
    }),

    getScanSummary: builder.query<Record<string, unknown>, string>({
      query: (scanId) => `/scans/${encodeURIComponent(scanId)}/summary`,
      providesTags: (_result, _error, id) => [{ type: 'Scan', id }],
    }),

    inspectScan: builder.mutation<
      InspectScanResponse,
      { file?: File; filename?: string; content?: string }
    >({
      queryFn: async (params, _queryApi, _extraOptions, baseQuery) => {
        const { file, filename, content } = params;
        let fileContent = content;
        if (file) {
          fileContent = await file.text();
        }
        const result = await baseQuery({
          url: '/scans/inspect',
          method: 'POST',
          body: {
            filename: file ? file.name : (filename || 'package.json'),
            content: fileContent,
          },
        });
        if (result.error) return { error: result.error };
        return { data: result.data as InspectScanResponse };
      },
    }),

    uploadScan: builder.mutation<UploadScanResponse, UploadScanParams>({
      queryFn: async (params, _queryApi, _extraOptions, baseQuery) => {
        const { file, filename, content, base64Content, projectId, assetId, reviewedComponents } = params;
        let base64 = base64Content || '';
        if (file && !base64) {
          const arrayBuffer = await file.arrayBuffer();
          base64 = btoa(
            new Uint8Array(arrayBuffer).reduce((acc, byte) => acc + String.fromCharCode(byte), '')
          );
        }
        const body = {
          filename: file ? file.name : (filename || 'package.json'),
          base64Content: base64 || undefined,
          content: content || undefined,
          projectId: projectId || undefined,
          assetId: assetId || undefined,
          name: file ? file.name : filename,
          reviewedComponents: reviewedComponents || undefined,
        };

        const result = await baseQuery({
          url: '/scans',
          method: 'POST',
          body,
        });

        if (result.error) return { error: result.error };
        return { data: result.data as UploadScanResponse };
      },
      invalidatesTags: [
        { type: 'Scan', id: 'LIST' },
        { type: 'Finding', id: 'LIST' },
        { type: 'Dashboard', id: 'ALL' },
      ],
    }),

    cancelScan: builder.mutation<{ message: string }, string>({
      query: (scanId) => ({
        url: `/scans/${encodeURIComponent(scanId)}/cancel`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Scan', id },
        { type: 'Scan', id: 'LIST' },
      ],
    }),

    exportSbom: builder.mutation<Blob, { scanId: string; format: string }>({
      query: ({ scanId, format }) => ({
        url: `/scans/${encodeURIComponent(scanId)}/export/sbom`,
        method: 'POST',
        body: { format },
        responseHandler: (response: Response) => response.blob(),
      }),
    }),

    downloadRawArtifact: builder.mutation<Blob, string>({
      query: (scanId) => ({
        url: `/scans/${encodeURIComponent(scanId)}/raw`,
        method: 'GET',
        responseHandler: (response: Response) => response.blob(),
      }),
    }),

  }),
});

export const {
  useGetScansQuery,
  useLazyGetScansQuery,
  useGetScanQuery,
  useLazyGetScanQuery,
  useGetScanComponentsQuery,
  useGetScanSummaryQuery,
  useInspectScanMutation,
  useUploadScanMutation,
  useCancelScanMutation,
  useExportSbomMutation,
  useDownloadRawArtifactMutation,
} = scansApi;
