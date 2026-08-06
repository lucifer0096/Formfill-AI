import Card from "@/components/ui/Card";

const FILE_TYPES = [
  { label: "PDF", description: "Portable Document Format" },
  { label: "PNG", description: "Portable Network Graphics" },
  { label: "JPG", description: "Joint Photographic Experts Group" },
];

interface SupportedFileTypesProps {
  className?: string;
}

export default function SupportedFileTypes({ className = "" }: SupportedFileTypesProps) {
  return (
    <Card as="section" aria-labelledby="file-types-heading" tabIndex={0} className={className}>
      <h2 id="file-types-heading" className="text-lg font-semibold">
        Supported file types
      </h2>
      <ul className="mt-4 space-y-4">
        {FILE_TYPES.map((type) => (
          <li key={type.label} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-muted/40 text-xs font-bold"
            >
              {type.label}
            </span>
            <span>
              <span className="block font-medium">{type.label}</span>
              <span className="block text-sm text-muted">{type.description}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
