import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TRAMA · Ropa urbana',
  description: 'Colección de indumentaria y gestión de inventario de TRAMA, ropa urbana.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-AR"><body>{children}</body></html>;
}
