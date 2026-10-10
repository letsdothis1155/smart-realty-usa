(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const canvas = el('scene'), ctx = canvas.getContext('2d');
  const number = value => value.toLocaleString();
  let blocks = [], selected = null, busy = false, lastGood = 0;
  let yaw = -.3, pitch = .4, zoom = 1, phase = 0, previous = 0, pointer = null, hits = [];
  let moving = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const visible = () => blocks.filter(b => el('filter').value === 'all' || (el('filter').value === 'full' ? b.weight >= 3600000 : b.weight < 3600000));
  function select(block) {
    selected = block;
    el('selected-heading').textContent = block ? `Block #${number(block.height)}` : 'No matching block';
    for (const id of ['tx', 'size', 'capacity', 'time', 'hash']) el(id).textContent = '—';
    el('external').hidden = !block;
    if (block) {
      el('tx').textContent = number(block.tx_count);
      el('size').textContent = `${(block.size / 1000000).toFixed(2)} MB`;
      el('capacity').textContent = `${(block.weight / 40000).toFixed(1)}%`;
      el('time').textContent = new Date(block.timestamp * 1000).toLocaleString();
      el('hash').textContent = block.id;
      el('external').href = `https://mempool.space/block/${block.id}`;
    }
    for (const button of el('blocks').children) button.setAttribute('aria-pressed', String(button.dataset.id === block?.id));
    draw();
  }
  function update() {
    const list = visible();
    const focusId = document.activeElement?.dataset?.id;
    el('blocks').replaceChildren(...list.map(block => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = `#${number(block.height)}`; button.dataset.id = block.id;
      button.addEventListener('click', () => select(block));
      return button;
    }));
    select(list.find(b => b.id === selected?.id) || list.at(-1) || null);
    if (focusId) Array.from(el('blocks').children).find(b => b.dataset.id === focusId)?.focus();
    el('empty').hidden = list.length > 0;
    el('empty').textContent = blocks.length ? 'No blocks match this filter.' : 'Network unavailable. Use Refresh data to retry.';
  }
  async function json(path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`https://mempool.space/api/${path}`, { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  async function refresh() {
    if (busy || document.hidden) return;
    busy = true; el('refresh').disabled = true;
    const [chain, pool] = await Promise.allSettled([json('blocks'), json('mempool')]);
    try {
      if (chain.status !== 'fulfilled' || !Array.isArray(chain.value) || !chain.value.length) throw new Error('Unavailable');
      const valid = chain.value.slice(0, 10);
      if (!valid.every(b => /^[a-f0-9]{64}$/.test(b.id) && ['height','tx_count','size','weight','timestamp'].every(k => Number.isSafeInteger(b[k]) && b[k] >= 0))) throw new Error('Invalid data');
      blocks = valid.sort((a,b) => a.height - b.height);
      lastGood = Date.now();
      el('tip').textContent = number(blocks.at(-1).height);
      el('checked').textContent = new Date(lastGood).toLocaleTimeString();
      el('status').textContent = 'Live · Bitcoin mainnet'; el('status').dataset.state = 'live';
    } catch {
      el('status').textContent = lastGood ? 'Stale · retrying' : 'Connection unavailable';
      el('status').dataset.state = 'stale';
    }
    const p = pool.status === 'fulfilled' ? pool.value : null;
    if (p && Number.isSafeInteger(p.count) && p.count >= 0 && Number.isFinite(p.vsize) && p.vsize >= 0) {
      el('pending').textContent = number(p.count); el('pool-size').textContent = `${(p.vsize / 1000000).toFixed(2)} MvB`;
      el('pool-status').textContent = '';
    } else {
      el('pending').textContent = '—'; el('pool-size').textContent = '—';
      el('pool-status').textContent = 'Mempool statistics are temporarily unavailable.';
    }
    update(); busy = false; el('refresh').disabled = false;
  }
  function project(x,y,z,w,h) {
    const rx = x*Math.cos(yaw)-z*Math.sin(yaw), rz = x*Math.sin(yaw)+z*Math.cos(yaw);
    const ry = y*Math.cos(pitch)-rz*Math.sin(pitch), depth = y*Math.sin(pitch)+rz*Math.cos(pitch);
    const scale = Math.min(w/16,h/5)*zoom/(1-depth*.035);
    return { x:w/2+rx*scale, y:h/2-ry*scale, depth };
  }
  function draw() {
    if (!ctx) return;
    const {width:w,height:h} = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1,2);
    if (canvas.width !== Math.round(w*dpr) || canvas.height !== Math.round(h*dpr)) { canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr); }
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const list=visible(); hits=list.map((b,i) => {
      const x=(i-(list.length-1)/2)*1.45, y=Math.sin(phase+i*.55)*.08;
      return {b,center:project(x,y,0,w,h),points:[[-.55,-.45,-.5],[.55,-.45,-.5],[.55,.45,-.5],[-.55,.45,-.5],[-.55,-.45,.5],[.55,-.45,.5],[.55,.45,.5],[-.55,.45,.5]].map(([a,c,d])=>project(x+a,y+c,d,w,h))};
    });
    ctx.strokeStyle='#395a67';ctx.beginPath();hits.forEach((item,i)=> i ? ctx.lineTo(item.center.x,item.center.y):ctx.moveTo(item.center.x,item.center.y));ctx.stroke();
    [...hits].sort((a,b)=>a.center.depth-b.center.depth).forEach(item=>{
      [[0,1,2,3],[1,5,6,2],[3,2,6,7]].forEach((face,index)=>{
        ctx.beginPath();face.forEach((v,i)=>i?ctx.lineTo(item.points[v].x,item.points[v].y):ctx.moveTo(item.points[v].x,item.points[v].y));ctx.closePath();
        ctx.fillStyle=(item.b.id===selected?.id ? ['#397f74','#58a994','#9ce6cd']:['#203f50','#2f6070','#518895'])[index];ctx.fill();
      });
      ctx.fillStyle='#e8edf6';ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillText(String(item.b.height),item.center.x,item.center.y+48);
    });
  }
  function motion() { el('motion').textContent=moving?'Pause motion':'Resume motion';el('motion').setAttribute('aria-pressed',String(!moving)); }
  function animate(now) { if (moving && !document.hidden) {phase+=Math.min((now-previous)/1000,.1);draw();}previous=now;requestAnimationFrame(animate); }
  canvas.addEventListener('pointerdown',e=>{pointer={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!pointer)return;yaw+=(e.clientX-pointer.x)*.005;pitch=Math.max(-.5,Math.min(.9,pitch+(e.clientY-pointer.y)*.005));pointer.x=e.clientX;pointer.y=e.clientY;draw();});
  canvas.addEventListener('pointerup',e=>{if(pointer && Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)<5){const r=canvas.getBoundingClientRect();const hit=hits.map(item=>({item,d:Math.hypot(item.center.x-e.clientX+r.left,item.center.y-e.clientY+r.top)})).sort((a,b)=>a.d-b.d)[0];if(hit?.d<40)select(hit.item.b);}pointer=null;});
  canvas.addEventListener('pointercancel',()=>{pointer=null;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.6,Math.min(1.8,zoom-e.deltaY*.001));draw();},{passive:false});
  el('motion').addEventListener('click',()=>{moving=!moving;motion();});
  el('reset').addEventListener('click',()=>{yaw=-.3;pitch=.4;zoom=1;draw();});
  el('filter').addEventListener('change',update);el('refresh').addEventListener('click',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  new ResizeObserver(draw).observe(canvas);
  setInterval(()=>{if(lastGood && Date.now()-lastGood>90000){el('status').textContent='Stale · retrying';el('status').dataset.state='stale';}refresh();},30000);
  motion();refresh();requestAnimationFrame(animate);
})();
