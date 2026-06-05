"use client";

// Client-side text extraction from images (OCR) and PDFs.
// Both libraries are heavy, so they're dynamically imported only when first
// used — they never touch the initial bundle.

export interface ExtractProgress {
  stage: string;
  progress: number; // 0..1
}

/**
 * OCR an image file into text using tesseract.js (v5+).
 * Worker, core, and language data are fetched from the tesseract CDN on first use.
 */
export async function extractTextFromImage(
  file: File | Blob,
  lang = "eng",
  onProgress?: (p: ExtractProgress) => void
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(lang, undefined, {
    logger: (m: { status: string; progress: number }) => {
      onProgress?.({ stage: m.status, progress: m.progress ?? 0 });
    },
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(file);
    return text.trim();
  } finally {
    await worker.terminate();
  }
}

/**
 * Extract the text layer from a PDF using pdfjs-dist.
 * The worker is loaded from a CDN pinned to the installed version, which avoids
 * bundler worker-resolution issues across Next.js/webpack/turbopack.
 */
export async function extractTextFromPdf(
  file: File | Blob,
  onProgress?: (p: ExtractProgress) => void
): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it) => ("str" in it ? (it as { str: string }).str : ""))
      .join(" ");
    parts.push(pageText);
    onProgress?.({ stage: `page ${pageNum}/${doc.numPages}`, progress: pageNum / doc.numPages });
  }

  // Release the worker/document. `destroy` exists at runtime but its presence
  // in the typings varies across pdfjs-dist versions, so call it defensively.
  await (doc as unknown as { destroy?: () => Promise<void> }).destroy?.();
  return parts.join("\n\n").trim();
}

/** Dispatch by file type. Returns extracted text (may be empty for scanned PDFs). */
export async function extractText(
  file: File,
  onProgress?: (p: ExtractProgress) => void
): Promise<string> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const text = await extractTextFromPdf(file, onProgress);
    // Scanned PDFs have no text layer — fall back to OCR'ing nothing is not
    // possible here (would need rasterising), so just return what we found.
    return text;
  }
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(file.name)) {
    return extractTextFromImage(file, "eng", onProgress);
  }
  // Plain text and everything else: read as text.
  return (await file.text()).trim();
}
