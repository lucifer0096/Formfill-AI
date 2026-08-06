"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import AccessibilityHighlights from "@/components/AccessibilityHighlights";
import UploadDropzone from "@/components/upload/UploadDropzone";
import { useFormSession } from "@/lib/form-session-context";

export default function UploadWorkflow() {
  const router = useRouter();
  const { setFile } = useFormSession();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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

      <div className="flex flex-col gap-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary">
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!selectedFile}
          aria-describedby="continue-hint"
          onClick={() => {
            setFile(selectedFile);
            router.push("/review");
          }}
        >
          Continue
        </Button>
      </div>
      <p id="continue-hint" role="status" aria-live="polite" className="sr-only text-right">
        {selectedFile ? "" : "Select a file above to enable Continue."}
      </p>
    </div>
  );
}
