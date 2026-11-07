/** A response the browser saves as `fileName` instead of showing. */
export function attachment(body: string, fileName: string, type: string): Response {
  const ascii = fileName.replace(/[^\x20-\x7e]|"/g, '_');
  return new Response(body, {
    headers: {
      'content-type': type,
      'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
    },
  });
}
