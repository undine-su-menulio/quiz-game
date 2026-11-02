export function createGameEffects({mount, makeAudio = () => new Audio(new URL('./TimTaj - Education.mp3', import.meta.url).href)} = {}) {
  const panel = document.createElement('section');
  panel.className = 'game-media'; panel.hidden = true; panel.setAttribute('aria-label','Музыка и эффекты');
  panel.innerHTML = '<div class="row"><button type="button" class="compact" data-music aria-pressed="false">♫ Включить музыку</button><label class="volume-control">Громкость <input type="range" min="0" max="100" value="30" aria-label="Громкость музыки"></label></div><p class="muted" data-audio-status role="status">Включите музыку только в одной вкладке: здесь или на общем экране.</p>';
  mount.before(panel);
  const button = panel.querySelector('[data-music]'), volume = panel.querySelector('input'), status = panel.querySelector('[data-audio-status]');
  let audio, enabled = false, wantsMusic = false, playing = false, pending = false, available = false;
  let currentRoom = '', currentQuestion = '', celebrated = '', cancelCelebration = () => {};

  function label() {
    button.textContent = enabled ? '♫ Выключить музыку' : '♫ Включить музыку';
    button.setAttribute('aria-pressed', String(enabled));
  }
  function stop() {
    audio?.pause(); playing = false;
  }
  function failure(error) {
    stop(); enabled = false; label();
    status.textContent = error?.name === 'NotAllowedError' ? 'Браузер заблокировал звук. Нажмите «Включить музыку» ещё раз.' : 'Не удалось воспроизвести музыку. Проверьте, загружен ли TimTaj - Education.mp3 рядом с index.html.';
  }
  async function play(unlock = false) {
    if (!audio || pending || playing || !enabled || (!wantsMusic && !unlock)) return;
    pending = true;
    try {
      await audio.play();
      if (!enabled || !available || !wantsMusic) stop();
      else playing = true;
    } catch (error) { if (enabled && error?.name !== 'AbortError') failure(error); }
    finally { pending = false; }
  }
  button.addEventListener('click', () => {
    enabled = !enabled;
    if (enabled) {
      if (!audio) {
        audio = makeAudio(); audio.loop = true; audio.preload = 'none'; audio.volume = Number(volume.value)/100;
        audio.addEventListener('error', () => failure());
      }
      status.textContent = 'Музыка играет только во время ответов. При показе результатов она остановится.';
      // Вызов play непосредственно из клика разрешает последующие запуски в этой вкладке.
      play(true);
    } else { stop(); status.textContent = 'Музыка выключена в этой вкладке.'; }
    label();
  });
  volume.addEventListener('input', () => { if (audio) audio.volume = Number(volume.value)/100; });

  function update(s, mode, remaining = 0) {
    available = Boolean(s && ['host','screen'].includes(mode)); panel.hidden = !available;
    wantsMusic = available && s.phase === 'question' && remaining > 0 && remaining <= s.seconds*1000;
    const question = s ? `${s.code}/${s.questionIndex}` : '';
    if (question !== currentQuestion) { stop(); if (audio) audio.currentTime = 0; currentQuestion = question; }
    if (wantsMusic && enabled) play();
    else if (!pending || !enabled || !available) stop();
    const room = s?.code || '';
    if (room !== currentRoom) { cancelCelebration(); celebrated = ''; currentRoom = room; }
    if (!s || s.phase !== 'finished') { cancelCelebration(); return; }
    if (celebrated !== room) {
      celebrated = room;
      cancelCelebration = celebrate();
    }
  }
  const onPageHide = () => { stop(); cancelCelebration(); };
  window.addEventListener('pagehide', onPageHide);
  return {update, destroy() { enabled = false; stop(); cancelCelebration(); panel.remove(); window.removeEventListener('pagehide',onPageHide); }};
}

function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const canvas = document.createElement('canvas'); canvas.className = 'celebration'; canvas.setAttribute('aria-hidden','true'); document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return () => {}; }
  let frame = 0, stopped = false;
  const width = innerWidth, height = innerHeight, ratio = Math.min(devicePixelRatio || 1,2);
  canvas.width = width*ratio; canvas.height = height*ratio; ctx.scale(ratio,ratio);
  const start = performance.now(), particles = [];
  const colors = ['#01c89d','#00866a','#ff8562','#ffb49f'];
  for (let burst=0;burst<5;burst++) {
    const x = width*(.15+Math.random()*.7), y = height*(.12+Math.random()*.36);
    for (let i=0;i<30;i++) {
      const angle = Math.random()*Math.PI*2, speed = 50+Math.random()*145;
      particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,delay:burst*550,life:2000+Math.random()*900,size:2+Math.random()*3,color:colors[i%colors.length]});
    }
  }
  function stop() { stopped = true; cancelAnimationFrame(frame); canvas.remove(); }
  function draw(now) {
    if (stopped) return;
    const elapsed = now-start; ctx.clearRect(0,0,width,height);
    for (const p of particles) {
      const age = elapsed-p.delay;
      if (age < 0 || age > p.life) continue;
      const t = age/1000, x = p.x+p.vx*t, y = p.y+p.vy*t+45*t*t;
      ctx.globalAlpha = (1-age/p.life)*(.65+.35*Math.sin(age/110));
      ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(x,y-p.size*2); ctx.lineTo(x+p.size/2,y-p.size/2); ctx.lineTo(x+p.size*2,y); ctx.lineTo(x+p.size/2,y+p.size/2); ctx.lineTo(x,y+p.size*2); ctx.lineTo(x-p.size/2,y+p.size/2); ctx.lineTo(x-p.size*2,y); ctx.lineTo(x-p.size/2,y-p.size/2); ctx.closePath(); ctx.fill();
    }
    if (elapsed > 5500) stop(); else frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);
  return stop;
}
