// The company the system is run for. Used on payslips, report headers and the
// bank/statutory files, so a change here changes every document.
export const COMPANY = {
  name: 'TEK International Contractors Ltd.',
  short: 'TEK',
  product: 'SiteTrack',
} as const;

// From the company logo: royal navy and its red.
export const BRAND_RGB = {
  navy: [34, 42, 114] as [number, number, number],
  navySoft: [236, 239, 250] as [number, number, number],
  crimson: [180, 60, 60] as [number, number, number],
  ink: [20, 24, 48] as [number, number, number],
  muted: [100, 106, 130] as [number, number, number],
  line: [221, 224, 238] as [number, number, number],
};
export const BRAND_HEX = { navy: '#222a72', navySoft: '#ecf0fa', crimson: '#b43c3c' } as const;

// Drop the company's logo at client/public/company-logo.png (a PNG at least
// ~600px wide looks sharp on a printed payslip) and it appears on every PDF.
// Until then documents use a text wordmark, so nothing breaks without it.
export const LOGO_URL = '/company-logo.png';

export interface LoadedLogo {
  dataUrl: string;
  width: number;
  height: number;
}

let logoPromise: Promise<LoadedLogo | null> | undefined;

export function loadLogo(): Promise<LoadedLogo | null> {
  logoPromise ??= (async () => {
    try {
      const res = await fetch(LOGO_URL, { cache: 'no-cache' });
      // A single-page app answers any unknown path with index.html, so check it really is an image.
      if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error('Logo could not be read'));
        img.src = dataUrl;
      });
      return { dataUrl, ...size };
    } catch {
      return null;
    }
  })();
  return logoPromise;
}
