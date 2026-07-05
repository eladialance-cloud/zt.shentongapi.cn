import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseAlpha: number;
}

interface ParticleMatrixProps {
  className?: string;
  particleCount?: number;
}

const LINK_DIST = 120;
const MOUSE_RADIUS = 80;
const FLOW_VX = 0.05;

export default function ParticleMatrix({ className, particleCount: particleCountProp }: ParticleMatrixProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const isMobile = window.innerWidth < 768;
    const particleCount = particleCountProp ?? (isMobile ? 300 : 1500);

    const setCanvasSize = () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const initParticles = () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      const arr: Particle[] = [];
      for (let i = 0; i < particleCount; i++) {
        arr.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: FLOW_VX + (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          size: Math.random() * 1.4 + 0.4,
          baseAlpha: Math.random() * 0.5 + 0.2,
        });
      }
      particlesRef.current = arr;
    };

    setCanvasSize();
    initParticles();

    const draw = () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      const particles = particlesRef.current;
      const mouse = mouseRef.current;

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (mouse.active) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MOUSE_RADIUS && dist > 0.5) {
            const force = (1 - dist / MOUSE_RADIUS) * 0.04;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
        }

        p.vx += (FLOW_VX - p.vx) * 0.02;
        p.vy += (0 - p.vy) * 0.02;
        p.x += p.vx;
        p.y += p.vy;

        if (p.x > w + 5) p.x = -5;
        else if (p.x < -5) p.x = w + 5;
        if (p.y > h + 5) p.y = -5;
        else if (p.y < -5) p.y = h + 5;
      }

      const cellSize = LINK_DIST;
      const cols = Math.max(1, Math.ceil(w / cellSize));
      const rows = Math.max(1, Math.ceil(h / cellSize));
      const grid: number[][] = new Array(cols * rows);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        let cx = Math.floor(p.x / cellSize);
        let cy = Math.floor(p.y / cellSize);
        if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
        if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
        const idx = cy * cols + cx;
        if (!grid[idx]) grid[idx] = [];
        grid[idx].push(i);
      }

      ctx.lineWidth = 0.6;
      ctx.strokeStyle = 'rgb(77, 200, 255)';
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const cellIdx = cy * cols + cx;
          const cell = grid[cellIdx];
          if (!cell) continue;

          for (let nx = cx; nx <= cx + 1; nx++) {
            for (let ny = (nx === cx ? cy : cy - 1); ny <= cy + 1; ny++) {
              if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
              const neighbor = grid[ny * cols + nx];
              if (!neighbor) continue;

              for (let a = 0; a < cell.length; a++) {
                const i = cell[a];
                const sameCell = nx === cx && ny === cy;
                const startB = sameCell ? a + 1 : 0;
                for (let b = startB; b < neighbor.length; b++) {
                  const j = neighbor[b];
                  if (j === i) continue;
                  const pa = particles[i];
                  const pb = particles[j];
                  const dx = pa.x - pb.x;
                  const dy = pa.y - pb.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  if (dist >= LINK_DIST) continue;

                  let alpha = (1 - dist / LINK_DIST) * 0.22;

                  if (mouse.active) {
                    const mx = (pa.x + pb.x) * 0.5 - mouse.x;
                    const my = (pa.y + pb.y) * 0.5 - mouse.y;
                    const md = Math.sqrt(mx * mx + my * my);
                    if (md < MOUSE_RADIUS) {
                      alpha += (1 - md / MOUSE_RADIUS) * 0.45;
                    }
                  }

                  ctx.globalAlpha = alpha;
                  ctx.beginPath();
                  ctx.moveTo(pa.x, pa.y);
                  ctx.lineTo(pb.x, pb.y);
                  ctx.stroke();
                }
              }
            }
          }
        }
      }

      ctx.fillStyle = 'rgb(150, 220, 255)';
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        let alpha = p.baseAlpha;
        let size = p.size;
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MOUSE_RADIUS) {
            const t = 1 - dist / MOUSE_RADIUS;
            alpha = Math.min(1, alpha + t * 0.6);
            size = p.size + t * 0.8;
          }
        }
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
      mouseRef.current.active = true;
    };
    const onMouseLeave = () => {
      mouseRef.current.active = false;
      mouseRef.current.x = -9999;
      mouseRef.current.y = -9999;
    };
    const onResize = () => {
      setCanvasSize();
      initParticles();
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      } else if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseout', onMouseLeave);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseout', onMouseLeave);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [particleCountProp]);

  const canvasClass = className ? `particle-matrix ${className}` : 'particle-matrix';
  return <canvas ref={canvasRef} className={canvasClass} />;
}