/* The sound a coin makes when it is clicked: the ring of coins, the story's
   coins, the footer row. window.sfCoinSound() plays it: a two-note chime,
   made in the browser, so there is no file to load. Browsers allow sound only
   from a click, which is the only place this is called from. */
(() => {
  let ac = null;
  function tone(t, freq, dur, gain) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "triangle"; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  window.sfCoinSound = () => {
    try {
      ac ??= new (window.AudioContext || window.webkitAudioContext)();
      // some browsers (Brave, Safari) start it paused even inside a click
      if (ac.state !== "running") ac.resume();
      const t = ac.currentTime + 0.01;
      tone(t, 1318.5, 0.08, 0.3);
      tone(t + 0.075, 1760, 0.42, 0.3);
    } catch {}
  };
})();
