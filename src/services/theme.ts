// Serviço de gerenciamento de cores do tema e variáveis CSS do Tailwind

export interface ThemeColorPreset {
  id: string;
  name: string;
  hex: string;
  description: string;
}

export const THEME_COLOR_PRESETS: ThemeColorPreset[] = [
  {
    id: 'blue',
    name: 'Azul Real',
    hex: '#2563eb',
    description: 'Padrão tradicional, sóbrio e congregacional',
  },
  {
    id: 'indigo',
    name: 'Índigo Solene',
    hex: '#4f46e5',
    description: 'Tom clássico e profundo para reuniões',
  },
  {
    id: 'sky',
    name: 'Azul Petróleo',
    hex: '#0284c7',
    description: 'Leve, agradável e com alta nitidez',
  },
  {
    id: 'emerald',
    name: 'Verde Esmeralda',
    hex: '#059669',
    description: 'Tom acolhedor que transmite paz e esperança',
  },
  {
    id: 'teal',
    name: 'Verde Turquesa',
    hex: '#0d9488',
    description: 'Moderno, equilibrado e sereno',
  },
  {
    id: 'purple',
    name: 'Violeta Nobre',
    hex: '#7c3aed',
    description: 'Elegante, distinto e com excelente contraste',
  },
  {
    id: 'rose',
    name: 'Vinho Rubi',
    hex: '#e11d48',
    description: 'Acolhedor, dinâmico e distinto',
  },
  {
    id: 'amber',
    name: 'Âmbar Dourado',
    hex: '#d97706',
    description: 'Tom quente, sóbrio e solene',
  },
  {
    id: 'slate',
    name: 'Grafite Ardósia',
    hex: '#475569',
    description: 'Minimalista, neutro e refinado',
  },
];

export const DEFAULT_PRIMARY_COLOR = '#2563eb';
const STORAGE_KEY = 'congregation_app_primary_color';

// Função para normalizar HEX
function normalizeHex(hex: string): string {
  let clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return DEFAULT_PRIMARY_COLOR;
  }
  return `#${clean.toLowerCase()}`;
}

// Converte HEX para RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const norm = normalizeHex(hex).slice(1);
  return {
    r: parseInt(norm.substring(0, 2), 16),
    g: parseInt(norm.substring(2, 4), 16),
    b: parseInt(norm.substring(4, 6), 16),
  };
}

// Converte RGB para HEX formatado
function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Gera variações calculadas para hover, fundos suaves, bordas e textos
export function calculateThemeVariants(hex: string) {
  const normalized = normalizeHex(hex);
  const { r, g, b } = hexToRgb(normalized);

  // Hover: escurece ~14%
  const hover = rgbToHex(r * 0.86, g * 0.86, b * 0.86);

  // Light: mistura 92% branco + 8% cor (ideal para fundos de cards e alertas)
  const light = rgbToHex(255 * 0.92 + r * 0.08, 255 * 0.92 + g * 0.08, 255 * 0.92 + b * 0.08);

  // Subtle: mistura 82% branco + 18% cor (ideal para badges e seleções leves)
  const subtle = rgbToHex(255 * 0.82 + r * 0.18, 255 * 0.82 + g * 0.18, 255 * 0.82 + b * 0.18);

  // Border: mistura 68% branco + 32% cor (bordas nítidas)
  const border = rgbToHex(255 * 0.68 + r * 0.32, 255 * 0.68 + g * 0.32, 255 * 0.68 + b * 0.32);

  // Text: escurece ~40% para alto contraste e leitura sem esforço sobre fundos claros
  const text = rgbToHex(r * 0.58, g * 0.58, b * 0.58);

  // Dark: escurece ~65% para contrastes profundos
  const dark = rgbToHex(r * 0.32, g * 0.32, b * 0.32);

  return {
    primary: normalized,
    hover,
    light,
    subtle,
    border,
    text,
    dark,
  };
}

// Aplica as variáveis CSS dinamicamente no elemento raiz do documento
export function applyPrimaryColor(hex: string): void {
  if (typeof document === 'undefined') return;

  const variants = calculateThemeVariants(hex);
  const root = document.documentElement;

  // Define as variáveis de cores do Tailwind v4
  root.style.setProperty('--primary', variants.primary);
  root.style.setProperty('--primary-hover', variants.hover);
  root.style.setProperty('--primary-light', variants.light);
  root.style.setProperty('--primary-subtle', variants.subtle);
  root.style.setProperty('--primary-border', variants.border);
  root.style.setProperty('--primary-text', variants.text);
  root.style.setProperty('--primary-dark', variants.dark);

  // Também define as variáveis complementares para garantir total compatibilidade
  root.style.setProperty('--color-primary', variants.primary);
  root.style.setProperty('--color-primary-hover', variants.hover);
  root.style.setProperty('--color-primary-light', variants.light);
  root.style.setProperty('--color-primary-subtle', variants.subtle);
  root.style.setProperty('--color-primary-border', variants.border);
  root.style.setProperty('--color-primary-text', variants.text);
  root.style.setProperty('--color-primary-dark', variants.dark);

  // Salva no localStorage para persistência entre sessões
  try {
    localStorage.setItem(STORAGE_KEY, variants.primary);
  } catch (err) {
    console.warn('[Theme] Erro ao salvar cor primária no localStorage:', err);
  }
}

// Obtém a cor salva ou a padrão
export function getStoredPrimaryColor(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_PRIMARY_COLOR;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeHex(saved) : DEFAULT_PRIMARY_COLOR;
  } catch {
    return DEFAULT_PRIMARY_COLOR;
  }
}

// Redefine a cor para o padrão do aplicativo
export function resetPrimaryColor(): string {
  applyPrimaryColor(DEFAULT_PRIMARY_COLOR);
  return DEFAULT_PRIMARY_COLOR;
}

// Inicializa o tema na carga da página
export function initializeTheme(): void {
  const current = getStoredPrimaryColor();
  applyPrimaryColor(current);
}
