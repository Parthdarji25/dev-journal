import Link from 'next/link';
import { FormatBadge } from '@/components/ui/chip';

/** Selector pills linking to each item's own page (maps, sheets). */
export function ItemPills({
  label,
  items,
  selected,
}: {
  label: string;
  items: { slug: string; title: string; href: string; format: 'md' | 'html' }[];
  selected: string;
}) {
  return (
    <nav aria-label={label} className="mb-6">
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.slug}>
            <Link
              href={item.href}
              scroll={false}
              aria-current={item.slug === selected ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border py-1 pr-4 pl-1.5 text-sm font-semibold transition-colors ${
                item.slug === selected
                  ? 'border-(--tc) bg-surface text-text'
                  : 'border-border bg-surface text-soft hover:bg-nav-active hover:text-text'
              }`}
            >
              <FormatBadge format={item.format} />
              {item.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
