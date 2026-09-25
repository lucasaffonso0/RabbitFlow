// Ícones em SVG inline (traço herda a cor do texto), no estilo de 1.75px
const base = {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
};

export const IconSearch = () => (
  <svg {...base}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const IconSend = () => (
  <svg {...base}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></svg>
);
export const IconCollapse = () => (
  <svg {...base}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="m16 10-2 2 2 2" /></svg>
);
export const IconExpand = () => (
  <svg {...base}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="m14 10 2 2-2 2" /></svg>
);
