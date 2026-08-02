"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import AccessibilityHighlights from "@/components/AccessibilityHighlights";
import UploadDropzone from "@/components/upload/UploadDropzone";
import { ingest } from "@/lib/ingest";
import { saveIngestResult } from "@/lib/session-store";
import { saveOriginalFile } from "@/lib/original-file-store";

export default function UploadWorkflow() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (!selectedFile) return;
    setError(null);
    setIsProcessing(true);
    try {
      const result = await ingest(selectedFile);
      if (result.kind === "form") {
        // Only the AcroForm path needs the original bytes later, to write
        // real answers into real fields at Confirm time.
        await saveOriginalFile(selectedFile);
        saveIngestResult({ kind: "form", form: result.form });
      } else if (result.kind === "text-layer") {
        saveIngestResult({ kind: "text-layer", result: result.result, fileName: selectedFile.name });
      } else {
        saveIngestResult({ kind: "needs-vision", fileName: selectedFile.name });
      }
      router.push("/review");
    } catch {
      setError("We couldn't read that file. Try a different PDF, or a clearer photo or scan.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="upload-heading" tabIndex={0} className="rounded-lg">
        <h2 id="upload-heading" className="sr-only">
          Drag and drop your form here, or choose a file
        </h2>
        <UploadDropzone selectedFile={selectedFile} onFileSelected={setSelectedFile} />
      </section>

      <AccessibilityHighlights />

      <Notice>
        No account required. Your files are processed securely and are not stored after your
        session ends.
      </Notice>

      {error && (
        <p role="alert" className="text-sm font-medium text-accent-strong">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" disabled={isProcessing}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!selectedFile || isProcessing}
          aria-describedby="continue-hint"
          onClick={handleContinue}
        >
          {isProcessing ? "Reading your form…" : "Continue"}
        </Button>
      </div>
      <p id="continue-hint" role="status" aria-live="polite" className="sr-only text-right">
        {!selectedFile
          ? "Select a file above to enable Continue."
          : isProcessing
            ? "Reading your form, please wait."
            : ""}
      </p>
    </div>
  );
}
