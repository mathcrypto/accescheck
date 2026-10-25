(() => {
  const canvas = document.getElementById('asciiFlow'),
    ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const head = { x: 80, y: 120, vx: 20, vy: 0 },
    mouse = { x: 0, y: 0, active: false };
  let width = innerWidth,
    height = innerHeight,
    scale = 1,
    raf = 0,
    last = 0,
    time = 0,
    nextGoal = 0,
    goals = 0,
    dirty = true,
    photoBottom = 0,
    rects = [];
  const particles = Array.from({ length: innerWidth < 600 ? 72 : 132 }, () => ({
    x: head.x,
    y: head.y,
    vx: 0,
    vy: 0,
    angle: Math.random() * Math.PI * 2,
    radius: Math.sqrt(Math.random()) * 32,
    lag: Math.random() * 1.5,
  }));
  const paused = () =>
    reduced.matches ||
    document.hidden ||
    document.body.classList.contains('motion-paused') ||
    document.body.classList.contains('has-results') ||
    ['needs', 'description'].includes(document.activeElement?.id) ||
    document.querySelector('dialog[open]');
  const blocked = (p, padding = 36) =>
    p.y < photoBottom + 16 ||
    rects.some(
      (r) =>
        p.x > r.left - padding &&
        p.x < r.right + padding &&
        p.y > r.top - padding &&
        p.y < r.bottom + padding,
    );
  const measure = () => {
    rects = [
      ...document.querySelectorAll(
        '.search-panel,.flow-protected,.intro-copy,.photo-credit,.footer,.menu[open] nav',
      ),
    ]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width && r.bottom > 0 && r.top < height);
    photoBottom = Math.max(
      0,
      document.querySelector('.intro-photo').getBoundingClientRect().bottom,
    );
    dirty = false;
  };
  const target = () => {
    goals++;
    if (goals % 5 === 0 && photoBottom < 16) {
      const r = document.querySelector('.brand').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    for (let i = 0; i < 32; i++) {
      const p = {
        x: 24 + Math.random() * (width - 48),
        y: photoBottom + 24 + Math.random() * Math.max(0, height - photoBottom - 48),
      };
      if (!blocked(p, 56)) return p;
    }
    return { x: width / 2, y: Math.min(height - 24, Math.max(photoBottom + 32, 100)) };
  };
  let goal = { x: width * 0.8, y: height * 0.25 };
  const visibility = (x, y) => {
    let fade = Math.min(1, Math.max(0, (y - photoBottom - 16) / 40));
    for (const r of rects) {
      const dx = Math.max(r.left - x, 0, x - r.right);
      const dy = Math.max(r.top - y, 0, y - r.bottom);
      const edge = Math.min(1, Math.max(0, (Math.hypot(dx, dy) - 20) / 64));
      fade = Math.min(fade, edge * edge * (3 - 2 * edge));
    }
    return fade;
  };
  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    const cells = new Set();
    for (const p of particles) {
      const x = Math.round(p.x / 8) * 8,
        y = Math.round(p.y / 11) * 11,
        key = x + ':' + y;
      const fade = visibility(x, y);
      if (cells.has(key) || fade === 0) continue;
      cells.add(key);
      const density = Math.max(0, 1 - p.radius / 42);
      const pulse = (Math.sin(time * 0.9 + p.angle) + 1) / 2;
      ctx.globalAlpha = (0.16 + density * 0.32) * fade;
      ctx.fillText('.:+*'[Math.min(3, Math.floor(density * 2 + pulse * 1.5))], x, y);
    }
    ctx.globalAlpha = 1;
  };
  const resize = () => {
    const previousWidth = width,
      previousHeight = height;
    width = innerWidth;
    height = innerHeight;
    scale = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.font = '11px "Courier New",monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = getComputedStyle(document.body).color;
    head.x *= width / previousWidth;
    head.y *= height / previousHeight;
    for (const p of particles) {
      p.x *= width / previousWidth;
      p.y *= height / previousHeight;
    }
    measure();
    head.y = Math.min(height - 16, Math.max(head.y, photoBottom + 48));
    goal = target();
    draw();
  };
  const tick = (now) => {
    raf = 0;
    if (paused()) {
      last = 0;
      return;
    }
    if (last && now - last < 1000 / 30) {
      raf = requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 30;
    last = now;
    time += dt;
    if (dirty) measure();
    if (time > nextGoal || Math.hypot(goal.x - head.x, goal.y - head.y) < 35) {
      goal = target();
      nextGoal = time + 5 + Math.random() * 4;
    }
    const following = mouse.active && !blocked(mouse, 48),
      destination = following ? mouse : goal;
    const dx = destination.x - head.x,
      dy = destination.y - head.y,
      distance = Math.hypot(dx, dy) || 1;
    const speed = following ? Math.min(900, distance * 7) : width < 600 ? 42 : 64,
      ease = 1 - Math.exp(-(following ? 8 : 2) * dt);
    head.vx += ((dx / distance) * speed - head.vx) * ease;
    head.vy += ((dy / distance) * speed - head.vy) * ease;
    head.x = Math.max(16, Math.min(width - 16, head.x + head.vx * dt));
    head.y = Math.min(height - 16, Math.max(photoBottom + 16, head.y + head.vy * dt));
    if (!following)
      for (const r of rects) {
        if (
          head.x < r.left - 48 ||
          head.x > r.right + 48 ||
          head.y < r.top - 48 ||
          head.y > r.bottom + 48
        )
          continue;
        const sides = [
          { x: r.left - 48, y: head.y },
          { x: r.right + 48, y: head.y },
          { x: head.x, y: r.top - 48 },
          { x: head.x, y: r.bottom + 48 },
        ].filter(
          (p) => p.x > 16 && p.x < width - 16 && p.y > photoBottom + 16 && p.y < height - 16,
        );
        sides.sort(
          (a, b) => Math.hypot(a.x - head.x, a.y - head.y) - Math.hypot(b.x - head.x, b.y - head.y),
        );
        if (sides[0]) {
          head.x = sides[0].x;
          head.y = sides[0].y;
          goal = target();
          nextGoal = time + 4;
        }
      }
    for (const p of particles) {
      const angle = p.angle + time * 0.35,
        radius = p.radius * (1 + Math.sin(time * 1.1 + p.angle) * 0.16);
      const lag = p.lag * (following ? 0.12 : 1);
      const x = head.x + Math.cos(angle) * radius - head.vx * lag,
        y = head.y + Math.sin(angle) * radius * 0.8 - head.vy * lag;
      p.vx += (x - p.x) * 18 * dt;
      p.vy += (y - p.y) * 18 * dt;
      const drag = Math.exp(-6 * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    draw();
    raf = requestAnimationFrame(tick);
  };
  const invalidate = () => {
    dirty = true;
    if (paused()) {
      measure();
      draw();
    }
  };
  const sync = () => {
    invalidate();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    if (!paused()) raf = requestAnimationFrame(tick);
  };
  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      mouse.active = true;
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => {
    mouse.active = false;
  });
  window.addEventListener('resize', () => {
    resize();
    sync();
  });
  window.addEventListener('scroll', invalidate, { passive: true });
  document.addEventListener('toggle', invalidate, true);
  document.addEventListener('focusin', sync);
  document.addEventListener('focusout', sync);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const dialog = document.getElementById('dialog');
  if (dialog) observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  window.addEventListener('pagehide', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  });
  window.addEventListener('pageshow', sync);
  resize();
  sync();
})();
