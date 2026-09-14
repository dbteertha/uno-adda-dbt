(() => {
  let config = null;
  let style = null;

  const text = (selector, value) => {
    const el = document.querySelector(selector);
    if (el && typeof value === 'string') el.textContent = value;
  };
  const toggle = (selector, visible) => {
    const el = document.querySelector(selector);
    if (el) el.hidden = !visible;
  };

  function ensureAdminButton() {
    if (document.getElementById('dbt-admin-open')) return;
    const actions = document.querySelector('.top-actions');
    if (!actions) return;
    const b = document.createElement('button');
    b.id = 'dbt-admin-open';
    b.className = 'icon-btn';
    b.type = 'button';
    b.title = 'DBT Admin Control Center';
    b.textContent = '⚙️';
    b.addEventListener('click', () => location.href = '/admin');
    actions.prepend(b);
  }

  function ensureAnnouncement(message) {
    let bar = document.getElementById('admin-announcement');
    if (!message) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'admin-announcement';
      bar.className = 'admin-announcement';
      document.body.prepend(bar);
    }
    bar.textContent = message;
  }

  function applyAvatars(list) {
    const wrap = document.getElementById('avatars');
    if (!wrap || !Array.isArray(list) || !list.length) return;
    const selected = wrap.querySelector('.avatar.active')?.dataset?.person;
    wrap.innerHTML = '';
    list.forEach((item, index) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'avatar' + ((item.label === selected || (!selected && index === 0)) ? ' active' : '');
      b.dataset.avatar = item.icon || '🎮';
      b.dataset.person = item.label || 'Player';
      const icon = document.createElement('span'); icon.textContent = item.icon || '🎮';
      const label = document.createElement('small'); label.textContent = item.label || 'Player';
      b.append(icon, label);
      wrap.appendChild(b);
    });
  }

  function apply(next) {
    if (!next || typeof next !== 'object') return;
    config = next;
    document.documentElement.style.setProperty('--admin-accent', next.accent || '#ff2f92');
    document.documentElement.style.setProperty('--admin-accent2', next.accent2 || '#41d9ff');
    document.documentElement.style.setProperty('--admin-bg', next.background || '#080817');

    text('.featured-copy h1 span', next.launcherTitle || 'UNO');
    const launcherSubtitle = document.querySelector('.featured-actions span');
    if (launcherSubtitle) launcherSubtitle.textContent = next.launcherSubtitle || '';

    text('.uno-hype-card h1', next.promoTitle || 'UNO ADDA');
    const promoParas = document.querySelectorAll('.uno-hype-card p');
    if (promoParas[0]) promoParas[0].textContent = next.collaborationText || next.promoText || '';
    if (promoParas[1]) promoParas[1].textContent = next.awardsText || '';

    text('#room-browser .room-browser-head b', next.roomsTitle || 'ACTIVE ROOMS');
    text('.suggested-users .room-browser-head b', next.usersTitle || 'USERS YOU MAY PLAY WITH');
    text('#commentator-name', `🎙️ ${next.commentatorName || 'MR BEAN'}`);
    text('#create .primary.big', next.createButton || 'Create room');
    text('#bot-play', next.botButton || 'Play bot');
    text('#join button[type="submit"]', next.joinButton || 'Join');

    toggle('.uno-hype-card', next.showPromo !== false);
    toggle('#room-browser', next.showRooms !== false);
    toggle('.suggested-users', next.showSuggestedUsers !== false);
    toggle('#commentary', next.showCommentary !== false);
    toggle('.hype-metrics span:first-child', next.simulatedHype !== false);
    ensureAnnouncement(next.announcement || '');
    applyAvatars(next.avatars);

    if (!style) {
      style = document.createElement('style');
      style.id = 'admin-custom-style';
      document.head.appendChild(style);
    }
    style.textContent = `
      .launcher-home{background-color:var(--admin-bg)!important}
      .launch-btn,.primary.big{box-shadow:0 0 30px color-mix(in srgb,var(--admin-accent) 28%,transparent)!important}
      .admin-announcement{position:sticky;top:0;z-index:99999;padding:10px 16px;text-align:center;font-weight:900;background:linear-gradient(90deg,var(--admin-accent),var(--admin-accent2));color:#08101a;box-shadow:0 8px 24px #0008}
      ${next.customCSS || ''}
    `;

    window.DBT_ADMIN_CONFIG = next;
    window.dispatchEvent(new CustomEvent('dbt-admin-config', { detail: next }));
  }

  ensureAdminButton();
  fetch('/api/config', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then(apply).catch(() => {});

  const waitSocket = setInterval(() => {
    const socket = window.DBT_CLASSIC_SOCKET;
    if (!socket) return;
    clearInterval(waitSocket);
    socket.on('s_admin_config', apply);
  }, 250);
})();
