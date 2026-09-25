import { getNodesBounds, type Node } from '@xyflow/react';
import { toPng } from 'html-to-image';
import { fmtDateTime, t } from '../i18n';

const PADDING = 40;
const HEADER = 76;
const FOOTER = 34;
// canvas grandes demais falham no navegador; limita o lado maior
const MAX_SIDE = 12000;
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * Renderiza o grafo inteiro (não só a área visível) em PNG, com cabeçalho da marca
 * RabbitFlow + contexto (cluster, vhost, data) e rodapé, e dispara o download.
 */
export async function exportGraphPng(nodes: Node[], subtitle: string, fileName: string) {
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport || nodes.length === 0) return;

  const bounds = getNodesBounds(nodes);
  // largura mínima para o cabeçalho caber mesmo em grafos pequenos
  const width = Math.max(560, Math.ceil(bounds.width + PADDING * 2));
  const height = Math.ceil(bounds.height + PADDING * 2);
  const pixelRatio = Math.max(1, Math.min(2, MAX_SIDE / Math.max(width, height + HEADER + FOOTER)));

  const css = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const bg = color('--bg', '#ffffff');
  const panel = color('--panel', '#ffffff');
  const border = color('--border', '#e2e5eb');
  const text = color('--text', '#141a26');
  const muted = color('--muted', '#677185');
  const accent = color('--accent', '#ff6a00');

  const graph = await toPng(viewport, {
    backgroundColor: bg,
    width,
    height,
    pixelRatio,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${(width - bounds.width) / 2 - bounds.x}px, ${PADDING - bounds.y}px) scale(1)`,
    },
  });

  const img = new Image();
  img.src = graph;
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round((HEADER + height + FOOTER) * pixelRatio);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(pixelRatio, pixelRatio);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, HEADER + height + FOOTER);

  // Cabeçalho: faixa da marca
  ctx.fillStyle = panel;
  ctx.fillRect(0, 0, width, HEADER);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, width, 4);
  ctx.fillStyle = border;
  ctx.fillRect(0, HEADER - 1, width, 1);

  ctx.textBaseline = 'middle';
  ctx.font = `26px ${FONT}`;
  ctx.fillText('🐇', PADDING, HEADER / 2 + 2);
  ctx.fillStyle = text;
  ctx.font = `700 22px ${FONT}`;
  const brandX = PADDING + 38;
  ctx.fillText('Rabbit', brandX, HEADER / 2 - 8);
  const rabbitW = ctx.measureText('Rabbit').width;
  ctx.fillStyle = accent;
  ctx.fillText('Flow', brandX + rabbitW, HEADER / 2 - 8);
  ctx.fillStyle = muted;
  ctx.font = `13px ${FONT}`;
  ctx.fillText(subtitle, brandX, HEADER / 2 + 15);

  const stamp = fmtDateTime(Date.now(), { dateStyle: 'short', timeStyle: 'medium' });
  ctx.font = `12px ${FONT}`;
  ctx.fillText(stamp, width - PADDING - ctx.measureText(stamp).width, HEADER / 2 + 2);

  ctx.drawImage(img, 0, 0, img.width, img.height, 0, HEADER, width, height);

  // Rodapé
  ctx.fillStyle = muted;
  ctx.font = `11px ${FONT}`;
  const foot = t('graph.exportFooter');
  ctx.fillText(foot, width - PADDING - ctx.measureText(foot).width, HEADER + height + FOOTER / 2);

  const a = document.createElement('a');
  a.download = fileName;
  a.href = canvas.toDataURL('image/png');
  a.click();
}
