// Save a Blob as a file. The anchor is attached while it is clicked (older Firefox needs that), and the object
// URL is revoked a little later: the download starts asynchronously, and revoking it straight after click()
// can leave Safari and some Firefox versions with an empty or failed file.
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
