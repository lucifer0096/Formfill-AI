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
        // The original bytes are still needed at Confirm time to write real
        // answers into real fields, for forms that have any (anchor.kind
        // === "acroform" on at least one field).
        await saveOriginalFile(selectedFile);
        saveIngestResult({ kind: "form", form: result.form });
      } else {
        saveIngestResult({ kind: "needs-vision", fileName: selectedFile.name });
      }
      router.push("/review");
    } catch (error) {
      // Logged, not shown: the user-facing message stays generic on purpose
      // (raw model/network errors aren't meaningful to a non-technical
      // user), but swallowing it entirely made real failures (timeouts,
      // rate limits, the known NZ-government-form gap) indistinguishable
      // from a genuinely bad file. See docs/KNOWN-ISSUES.html.
      console.error("Form classification failed:", error);
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
