(() => {
  if (window.__dbtCinematicFlowInstalled) return;
  window.__dbtCinematicFlowInstalled = true;

  let nameAccepted = false;
  let allowOriginalContinue = false;

  const openNameGate = () => {
    const gate = document.getElementById('name-gate');
    const input = document.getElementById('gate-name');
    if (!gate || !(gate instanceof HTMLDialogElement)) return false;
    const saved = localStorage.getItem('dbt-player-name') || '';
    if (input instanceof HTMLInputElement) input.value = saved;
    if (!gate.open) gate.showModal();
    setTimeout(() => input?.focus(), 30);
    return true;
  };

  const acceptNameThenIntro = () => {
    const gate = document.getElementById('name-gate');
    const input = document.getElementById('gate-name');
    const hidden = document.getElementById('name');
    const value = input instanceof HTMLInputElement ? input.value.trim().slice(0, 24) : '';
    if (!value) {
      input?.focus();
      return;
    }
    localStorage.setItem('dbt-player-name', value);
    if (hidden instanceof HTMLInputElement) hidden.value = value;
    if (gate instanceof HTMLDialogElement && gate.open) gate.close();
    nameAccepted = true;
    document.getElementById('home-play-uno')?.click();
  };

  document.addEventListener('click', (e) => {
    const continueBtn = e.target.closest?.('#gate-continue');
    if (continueBtn && !allowOriginalContinue) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      acceptNameThenIntro();
      return;
    }

    const target = e.target.closest?.('#home-play-uno,.game-tile[data-game="uno"]');
    if (!target) return;

    if (window.__dbtCinematicPass && nameAccepted) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      nameAccepted = false;
      allowOriginalContinue = true;
      document.getElementById('gate-continue')?.click();
      allowOriginalContinue = false;
      return;
    }

    if (!nameAccepted) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openNameGate();
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const input = e.target;
    if (!(input instanceof HTMLElement) || input.id !== 'gate-name') return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    acceptNameThenIntro();
  }, true);
})();
