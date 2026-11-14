import axiosInstance from '../services/axiosInstance.service';

const FILENAME_PATTERN = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i;

/** Downloads a file from the API through the browser and returns its name. */
export const downloadBlob = async (
  path: string,
  fallbackName: string
): Promise<string> => {
  const response = await axiosInstance.get<Blob>(path, {
    responseType: 'blob',
  });
  const disposition = String(response.headers['content-disposition'] ?? '');
  const filename = decodeURIComponent(
    disposition.match(FILENAME_PATTERN)?.[1] ?? fallbackName
  );
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return filename;
};
