import { AxiosError } from 'axios';
import { api } from '@/api/client';

export interface UploadParams {
  file: File;
  batchSize: number;
  delayBetweenBatches: number;
}

export interface UploadSuccess {
  success: true;
  key: string;
  url: string;
  batchSize: number;
  delayBetweenBatches: number;
}

/** Shape returned by the backend's header-validation 400. */
export interface HeaderValidationError {
  error: string;
  missingHeaders: string[];
  requiredHeaders: string[];
  uploadedHeaders: string[];
}

export interface UploadFailure {
  message: string;
  validation?: HeaderValidationError;
}

export async function uploadLeads(params: UploadParams): Promise<UploadSuccess> {
  const form = new FormData();
  form.append('file', params.file);
  form.append('batchSize', String(params.batchSize));
  form.append('delayBetweenBatches', String(params.delayBetweenBatches));

  try {
    const { data } = await api.post<UploadSuccess>('/api/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  } catch (err) {
    throw toUploadFailure(err);
  }
}

function toUploadFailure(err: unknown): UploadFailure {
  if (err instanceof AxiosError) {
    const data = err.response?.data as Partial<HeaderValidationError> | undefined;
    if (data && Array.isArray(data.missingHeaders)) {
      return { message: data.error || 'Missing required headers', validation: data as HeaderValidationError };
    }
    return { message: (data as { error?: string })?.error || err.message || 'Upload failed' };
  }
  return { message: 'Unexpected error during upload' };
}
