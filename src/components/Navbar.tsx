import Image from "next/image";
import Link from "next/link";

export default function Navbar() {
  return (
    <header className="bg-black text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-2">
        <Link href="/" className="flex items-center gap-2" aria-label="MFIF home">
          <Image src="/logo.png" alt="MFIF logo" width={120} height={80} priority />
        </Link>
        <nav aria-label="Primary">
          <ul className="flex items-center gap-8 text-lg font-medium">
            <li>
              <Link
                href="/accessibility"
                className="underline decoration-transparent underline-offset-4 hover:text-accent hover:decoration-current focus-visible:text-accent"
              >
                Accessibility
              </Link>
            </li>
            <li>
              <Link
                href="/help"
                className="underline decoration-transparent underline-offset-4 hover:text-accent hover:decoration-current focus-visible:text-accent"
              >
                Help
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
