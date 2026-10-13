import { ImageResponse } from 'next/og';
import { siteName } from '@/lib/site';

export const dynamic = 'force-static';

const size = { width: 1200, height: 630 };

/**
 * Default social image, rendered once at build time to /og-image.png (a route
 * rather than the opengraph-image convention, whose exported file has no
 * extension and so no reliable content type on a static host).
 */
export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 80,
        background: '#0F1115',
        color: '#E6E8EC',
      }}
    >
      <div style={{ display: 'flex', gap: 12, marginBottom: 40 }}>
        {['#FDBA74', '#7DD3FC', '#C4B5FD', '#6EE7B7', '#F9A8D4'].map((c) => (
          <div key={c} style={{ width: 72, height: 12, borderRadius: 6, background: c }} />
        ))}
      </div>
      <div style={{ fontSize: 40, color: '#9AA1AD' }}>{siteName}</div>
      <div style={{ fontSize: 72, fontWeight: 700, marginTop: 16, lineHeight: 1.1 }}>
        A notebook for everything I&apos;m learning.
      </div>
    </div>,
    size,
  );
}
