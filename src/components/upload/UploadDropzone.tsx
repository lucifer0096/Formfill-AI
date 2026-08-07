"use client";

import { useId, useState } from "react";
import { speak } from "@/lib/speech";

const ACCEPTED_TYPES = ".pdf,.png,.jpg,.jpeg";
const MAX_SIZE_MB = 50;

interface UploadDropzoneProps {
  selectedFile: File | null;
  onFileSelected: (file: File | null) => void;
  className?: string;
}

export default function UploadDropzone({
  selectedFile,
  onFileSelected,
  className = "",
}: UploadDropzoneProps) {
  const inputId = useId();
  const hintId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  function handleFiles(files: FileList | null) {
    const file = files?.[0] ?? null;
    onFileSelected(file);
    setStatusMessage(
      file
        ? `${file.name} selected, ${(file.size / (1024 * 1024)).toFixed(1)} megabytes.`
        : "No file selected."
    );
    // Team-requested for hackathon day: a spoken confirmation naming the
    // file as soon as it's chosen or dropped, distinct from the sr-only
    // live region above (that only reaches someone with a real screen
    // reader already running; this uses the app's own manual speech
    // module, the same one Read Aloud and Ctrl+Alt+S already use).
    if (file) speak(`${file.name} has been uploaded.`);
  }

  return (
    <div className={className}>
      <div
        className={`rounded-lg border-2 p-8 text-center transition-colors ${
          isDragging
            ? "border-solid border-accent-strong bg-accent-strong/5"
            : "border-dashed border-muted/60"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="mx-auto h-12 w-12 text-muted"
        >
          <path d="M7 18a4 4 0 0 1-1-7.87A5.5 5.5 0 0 1 16.5 8h.5a4.5 4.5 0 0 1 1 8.89" />
          <path d="M12 12v7m0-7 3 3m-3-3-3 3" />
        </svg>

        <p className="mt-4 text-lg">
          Drag and drop your form here, or{" "}
          <input
            id={inputId}
            type="file"
            accept={ACCEPTED_TYPES}
            aria-describedby={hintId}
            className="peer sr-only"
            onChange={(event) => handleFiles(event.target.files)}
          />
          <label
            htmlFor={inputId}
            className="cursor-pointer rounded font-semibold text-accent-strong underline underline-offset-4 hover:text-accent peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-strong"
          >
            choose a file
          </label>
        </p>

        <p id={hintId} className="mt-2 text-sm text-muted">
          PDF, PNG, or JPG up to {MAX_SIZE_MB}MB
        </p>

        {selectedFile && (
          <p className="mt-4 text-base font-medium">Selected file: {selectedFile.name}</p>
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {statusMessage}
      </p>
    </div>
  );
}
