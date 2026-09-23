import Link from "next/link";

type Props = {
  title?: string;
  subtitle?: string;
};

export function SiteHeader({ title = "설화고 시험감독표", subtitle }: Props) {
  return (
    <header className="site-header-bar shadow-sm">
      <div className="container flex min-h-[4.5rem] flex-col justify-center px-4 py-4 sm:px-6">
        <Link href="/" className="text-xl font-bold tracking-wide text-primary-foreground sm:text-2xl">
          {title}
        </Link>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-sm text-primary-foreground/85">{subtitle}</p>
        ) : null}
      </div>
    </header>
  );
}
