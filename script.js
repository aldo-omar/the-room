// Reveal sections as they enter the viewport, with a graceful fallback.
// To manage the ticket CTA, toggle `enabled` and set `url` to the ticket shop.
const ticketCTASettings = {
  enabled: true,
  url: "",
};

const ticketCTA = document.querySelector("[data-ticket-cta]");
if (ticketCTA) {
  ticketCTA.hidden = !ticketCTASettings.enabled;
  if (ticketCTASettings.url) {
    ticketCTA.href = ticketCTASettings.url;
    ticketCTA.target = "_blank";
    ticketCTA.rel = "noreferrer";
  } else {
    ticketCTA.querySelector("span").textContent = "PRÓXIMAMENTE";
    ticketCTA.setAttribute("aria-disabled", "true");
    ticketCTA.tabIndex = -1;
  }
}

const siteHeader = document.querySelector(".room-nav");
const menuToggle = siteHeader?.querySelector("[data-menu-toggle]");
const headerLinks = siteHeader?.querySelector("[data-header-links]");

const setHeaderMenuOpen = (open, restoreFocus = false) => {
  if (!siteHeader || !menuToggle) return;
  const wasOpen = menuToggle.getAttribute("aria-expanded") === "true";
  siteHeader.classList.toggle("menu-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  if (restoreFocus && wasOpen) menuToggle.focus();
};

if (siteHeader && menuToggle && headerLinks) {
  menuToggle.addEventListener("click", () => {
    const open = menuToggle.getAttribute("aria-expanded") !== "true";
    if (open) {
      const tempoTrigger = siteHeader.querySelector(".metro-trigger");
      const tempoPanel = siteHeader.querySelector(".metro-panel");
      tempoTrigger?.setAttribute("aria-expanded", "false");
      if (tempoPanel) tempoPanel.hidden = true;
    }
    setHeaderMenuOpen(open);
  });

  headerLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setHeaderMenuOpen(false));
  });

  document.addEventListener("click", (event) => {
    if (!siteHeader.contains(event.target)) setHeaderMenuOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setHeaderMenuOpen(false, true);
  });
}

// Cookie preference panel. Optional consent is saved as a preference only;
// no analytics or marketing scripts are currently loaded by this page.
const privacyModal = document.querySelector("[data-privacy-modal]");
if (privacyModal) {
  const consentKey = "the-room-consent-v1";
  const privacyNotice = document.querySelector("[data-privacy-notice]");
  const optionalSwitch = privacyModal.querySelector("[data-privacy-switch]");
  let optionalAllowed = false;

  const readConsent = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(consentKey) || "null");
      return saved && typeof saved.analyticsMarketing === "boolean" ? saved : null;
    } catch {
      return null;
    }
  };

  const setOptional = (allowed) => {
    optionalAllowed = allowed;
    optionalSwitch?.setAttribute("aria-checked", String(allowed));
    const state = optionalSwitch?.querySelector(".switch-state");
    if (state) state.textContent = allowed ? "SÍ" : "NO";
  };

  const showPrivacy = () => {
    setOptional(readConsent()?.analyticsMarketing === true);
    if (!privacyModal.open) privacyModal.showModal();
  };

  const saveConsent = (analyticsMarketing) => {
    setOptional(analyticsMarketing);
    try {
      localStorage.setItem(consentKey, JSON.stringify({
        essential: true,
        analyticsMarketing,
        savedAt: new Date().toISOString(),
      }));
    } catch {
      // The choice still takes effect for this page view if storage is blocked.
    }
    if (privacyNotice) privacyNotice.hidden = true;
    privacyModal.close();
  };

  document.querySelectorAll("[data-privacy-open]").forEach((button) => {
    button.addEventListener("click", showPrivacy);
  });
  privacyModal.querySelector("[data-privacy-close]")?.addEventListener("click", () => privacyModal.close());
  document.querySelectorAll("[data-privacy-essential]").forEach((button) => button.addEventListener("click", () => saveConsent(false)));
  privacyModal.querySelector("[data-privacy-save]")?.addEventListener("click", () => saveConsent(optionalAllowed));
  document.querySelectorAll("[data-privacy-all]").forEach((button) => button.addEventListener("click", () => saveConsent(true)));
  optionalSwitch?.addEventListener("click", () => setOptional(optionalSwitch.getAttribute("aria-checked") !== "true"));

  privacyModal.querySelectorAll(".privacy-expand").forEach((button) => {
    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      const detail = document.getElementById(button.getAttribute("aria-controls"));
      button.setAttribute("aria-expanded", String(!expanded));
      button.textContent = expanded ? "＋" : "−";
      if (detail) detail.hidden = expanded;
    });
  });

  privacyModal.addEventListener("cancel", (event) => {
    event.preventDefault();
    privacyModal.close();
  });

  if (privacyNotice) privacyNotice.hidden = Boolean(readConsent());
}

// Header metronome: preset BPMs, tap tempo, pause/resume, optional kick.
const metronome = document.querySelector("[data-metronome]");
if (metronome) {
  const beatButtons = [...metronome.querySelectorAll("[data-tap]")];
  const tempoReadout = metronome.querySelector("[data-tempo-readout]");
  const panelTempo = metronome.querySelector("[data-panel-tempo]");
  const trigger = metronome.querySelector(".metro-trigger");
  const panel = metronome.querySelector(".metro-panel");
  const toggleButton = metronome.querySelector("[data-metronome-toggle]");
  const toggleLabel = metronome.querySelector("[data-toggle-label]");
  const kickButton = metronome.querySelector("[data-kick-toggle]");
  const kickLabel = metronome.querySelector("[data-kick-label]");
  const hero = document.querySelector(".room-hero");
  const heroTitle = document.querySelector(".hero-title--typing");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let bpm = 128;
  let beat = 0;
  let running = true;
  let kickEnabled = false;
  let timer = 0;
  let tapTimes = [];
  let audioContext;

  const updateTempo = () => {
    tempoReadout.textContent = String(bpm);
    panelTempo.textContent = `${bpm} BPM`;
    metronome.querySelectorAll("[data-bpm]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.bpm) === bpm));
    });
  };

  const flashHero = () => {
    if (!hero || reducedMotion.matches) return;
    hero.classList.remove("is-flash");
    requestAnimationFrame(() => {
      hero.classList.add("is-flash");
      const pulseDuration = Math.min(130, (60000 / bpm) * 0.28);
      window.setTimeout(() => hero.classList.remove("is-flash"), pulseDuration);
    });
  };

  const restartTypewriterAtDownbeat = () => {
    if (!heroTitle || reducedMotion.matches) return;
    heroTitle.classList.remove("is-tempo-running", "is-tempo-synced");
    void heroTitle.offsetWidth;
    heroTitle.classList.add("is-tempo-synced", "is-tempo-running");
  };

  const playKick = () => {
    if (!kickEnabled) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext ||= new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(120, now);
    oscillator.frequency.exponentialRampToValueAtTime(46, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.19);
  };

  const scheduleBeat = () => {
    if (!running) return;
    beat = (beat % 4) + 1;
    beatButtons.forEach((button, index) => button.classList.toggle("is-active", index === beat - 1));
    if (beat === 1) {
      flashHero();
      restartTypewriterAtDownbeat();
    }
    playKick();
    timer = window.setTimeout(scheduleBeat, 60000 / bpm);
  };

  const restart = () => {
    window.clearTimeout(timer);
    beat = 0;
    beatButtons.forEach((button) => button.classList.remove("is-active"));
    if (heroTitle && !reducedMotion.matches) {
      heroTitle.classList.remove("is-tempo-running", "is-tempo-synced");
      heroTitle.style.setProperty("--tempo-bar", `${240000 / bpm}ms`);
      // Reset the CSS animation phase with the metronome's next downbeat.
      void heroTitle.offsetWidth;
      heroTitle.classList.add("is-tempo-synced");
    }
    if (running) scheduleBeat();
  };

  const setRunning = (nextState) => {
    running = nextState;
    toggleButton.setAttribute("aria-pressed", String(running));
    toggleLabel.textContent = running ? "PAUSAR" : "REANUDAR";
    if (!running) {
      window.clearTimeout(timer);
      beatButtons.forEach((button) => button.classList.remove("is-active"));
      heroTitle?.classList.remove("is-tempo-running");
    } else {
      restart();
    }
  };

  updateTempo();
  restart();

  trigger.addEventListener("click", () => {
    setHeaderMenuOpen(false);
    const isOpen = trigger.getAttribute("aria-expanded") === "true";
    trigger.setAttribute("aria-expanded", String(!isOpen));
    panel.hidden = isOpen;
  });

  metronome.querySelectorAll("[data-bpm]").forEach((button) => {
    button.addEventListener("click", () => {
      bpm = Number(button.dataset.bpm);
      updateTempo();
      if (running) restart();
    });
  });

  beatButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const now = performance.now();
      if (tapTimes.length && (now - tapTimes[tapTimes.length - 1] < 250 || now - tapTimes[tapTimes.length - 1] > 2000)) tapTimes = [];
      tapTimes.push(now);
      tapTimes = tapTimes.slice(-5);
      if (tapTimes.length >= 2) {
        const intervals = tapTimes.slice(1).map((time, index) => time - tapTimes[index]);
        bpm = Math.max(40, Math.min(220, Math.round(60000 / (intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length))));
        updateTempo();
        if (running) restart();
      }
    });
  });

  toggleButton.addEventListener("click", () => setRunning(!running));
  kickButton.addEventListener("click", () => {
    kickEnabled = !kickEnabled;
    kickButton.setAttribute("aria-pressed", String(kickEnabled));
    kickLabel.textContent = kickEnabled ? "KICK ON" : "KICK OFF";
  });

  document.addEventListener("click", (event) => {
    if (!metronome.contains(event.target)) {
      trigger.setAttribute("aria-expanded", "false");
      panel.hidden = true;
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      trigger.setAttribute("aria-expanded", "false");
      panel.hidden = true;
    }
  });
}

const revealItems = document.querySelectorAll("[data-reveal]");

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.14 });

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}
