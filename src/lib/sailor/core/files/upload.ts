import { uploadFiles as uploadFilesRemote } from '$sailor/remote/files.remote.js';

export interface UploadOptions {
  onFileProgress?: (fileName: string, progress: number) => void;
  onFileComplete?: (fileName: string, result: any) => void;
  onFileError?: (fileName: string, error: string) => void;
  onAllComplete?: (results: { fileName: string; result?: any; error?: string }[]) => void;
  signal?: AbortSignal;
  maxConcurrent?: number;
  alt?: string;
  title?: string;
  description?: string;
  maxSize?: number;
  accept?: string;
  created_at?: Date;
}

/**
 * Upload files with progress tracking
 * This is the main upload function - simple and clean
 */
export async function uploadFiles(
  files: FileList | File[],
  options: UploadOptions = {}
): Promise<{ fileName: string; result?: any; error?: string }[]> {
  const fileArray = Array.from(files);
  const results: { fileName: string; result?: any; error?: string }[] = [];
  const maxConcurrent = options.maxConcurrent || 3;

  // Process files in chunks to limit concurrent uploads
  for (let i = 0; i < fileArray.length; i += maxConcurrent) {
    const chunk = fileArray.slice(i, i + maxConcurrent);

    const chunkPromises = chunk.map(async (file) => {
      try {
        // Convert File to serializable format for remote function
        const arrayBuffer = await file.arrayBuffer();
        const serializableFile = {
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: file.lastModified,
          data: new Uint8Array(arrayBuffer)
        };

        // Show upload started
        options.onFileProgress?.(file.name, 10);

        // Call the remote function
        const result = await uploadFilesRemote({
          files: [serializableFile],
          options: {
            alt: options.alt,
            title: options.title,
            description: options.description,
            maxSize: options.maxSize,
            accept: options.accept,
            created_at: options.created_at
          }
        });

        if (result.success) {
          options.onFileProgress?.(file.name, 100);
          const fileResult = { fileName: file.name, result };
          results.push(fileResult);
          options.onFileComplete?.(file.name, result);
          return fileResult;
        } else {
          throw new Error(result.error || 'Upload failed');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Upload failed';
        const fileResult = { fileName: file.name, error: errorMsg };
        results.push(fileResult);
        options.onFileError?.(file.name, errorMsg);
        return fileResult;
      }
    });

    await Promise.all(chunkPromises);
  }

  options.onAllComplete?.(results);
  return results;
}
