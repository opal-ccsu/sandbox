/**
 * CR Path shared runtime -- v1.0 (2026-09-08)
 * Loaded by Module 0 (crpath) and the PathwayU Unit (matches) before their own app.js.
 * One file so a fix lands in both modules. Provides:
 *   isLMS()            true when a SCORM API (2004 or 1.2) is reachable; false on the website
 *   timer              per-page time-on-task, paused while the tab is hidden
 *   formatUnlock(ts)   {text, iso} for "Part B unlocks Saturday, Sep 5 at 2:15 PM"
 *   resume.*           build / seed / copy the #s= resume link (website only)
 *   copyToClipboard()  clipboard write with a select-and-copy fallback dialog
 *   attachDictation()  "Dictate" button on long-answer boxes (Web Speech API; hidden if unsupported)
 *   qualtricsPost()    hidden-form POST into an iframe kept alive long enough to finish
 *   demoSCORM()        in-memory stand-in for the SCORM wrapper used by [DEMO] builds
 *   banner(text)       fixed notice bar (used by demos)
 */
var CRShared = (function () {
  'use strict';

  // ---------- LMS detection ----------
  function findAPI(win) {
    var n = 0;
    try {
      while (win && n < 10) {
        if (win.API_1484_11 || win.API) return true;
        if (win === win.parent) break;
        win = win.parent; n++;
      }
    } catch (e) { /* cross-origin parent: nothing reachable */ }
    return false;
  }
  var _isLMS = null;
  function isLMS() {
    if (_isLMS === null) {
      _isLMS = findAPI(window);
      if (!_isLMS) { try { _isLMS = !!(window.opener && findAPI(window.opener)); } catch (e) { _isLMS = false; } }
    }
    return _isLMS;
  }

  // ---------- page timer ----------
  var T = { key: null, since: null, times: null };
  function flush() {
    if (T.key !== null && T.since !== null && T.times) {
      var s = Math.round((Date.now() - T.since) / 1000);
      if (s > 0) T.times[T.key] = (T.times[T.key] || 0) + s;
      T.since = Date.now();
    }
  }
  var timer = {
    switchTo: function (key, times) { flush(); T.key = String(key); T.times = times; T.since = (document.visibilityState === 'hidden') ? null : Date.now(); },
    flush: flush,
    pause: function () { flush(); T.since = null; },
    resume: function () { if (T.key !== null && T.since === null) T.since = Date.now(); },
    sum: function (times, pred) { var t = 0; for (var k in times) { if (times.hasOwnProperty(k) && (!pred || pred(parseInt(k, 10)))) t += times[k]; } return t; }
  };
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') timer.pause(); else timer.resume();
  });

  // ---------- unlock time ----------
  function formatUnlock(ts) {
    var d = new Date(ts);
    var text;
    try {
      text = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) +
             ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    } catch (e) { text = d.toString(); }
    return { text: text, iso: d.toISOString() };
  }

  // ---------- resume link (#s=<base64url JSON>) ----------
  function b64encode(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64decode(b64) { return decodeURIComponent(escape(atob(b64.replace(/-/g, '+').replace(/_/g, '/')))); }
  var resume = {
    build: function (json) { return location.origin + location.pathname + '#s=' + b64encode(json || '{}'); },
    /* Called before the app boots. Writes the linked state into localStorage under storageKey and strips the hash. */
    seedFromHash: function (storageKey) {
      try {
        var h = location.hash;
        if (h && h.indexOf('#s=') === 0) {
          var json = b64decode(h.slice(3));
          JSON.parse(json);
          localStorage.setItem(storageKey, json);
          history.replaceState(null, '', location.pathname + location.search);
          return true;
        }
      } catch (e) { /* malformed link: start fresh */ }
      return false;
    },
    copy: function (btn, storageKey) {
      var url = resume.build(localStorage.getItem(storageKey) || '{}');
      copyToClipboard(url, btn, '\u2713 Link copied', 'Copy your resume link');
    }
  };

  // ---------- clipboard with fallback ----------
  function ensureStyles() {
    if (document.getElementById('crshared-style')) return;
    var st = document.createElement('style'); st.id = 'crshared-style';
    st.textContent =
      '#crs-fallback{position:fixed;inset:0;background:rgba(20,30,60,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px}' +
      '#crs-fallback .crs-box{background:#fff;border-radius:12px;padding:18px;max-width:640px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:inherit}' +
      '#crs-fallback h4{font-size:15px;margin:0 0 6px}#crs-fallback p{font-size:13px;color:#555;margin:0 0 10px}' +
      '#crs-fallback textarea{width:100%;height:240px;font:13px/1.5 monospace;border:1px solid #ccd;border-radius:8px;padding:10px;box-sizing:border-box}' +
      '#crs-fallback .crs-actions{text-align:right;margin-top:10px}' +
      '#crs-fallback button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid #889;background:#f7f8fa;cursor:pointer}' +
      '.crs-dictate{display:inline-flex;align-items:center;gap:6px;font:12px/1 inherit;padding:5px 10px;margin:4px 0 10px;border:1px solid #b8c0cc;border-radius:16px;background:#f7f8fa;color:#334;cursor:pointer}' +
      '.crs-dictate.on{background:#fde8e6;border-color:#c1452b;color:#8a2a1a}' +
      '.crs-dictate-wrap{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.crs-interim{font-size:12px;color:#667;font-style:italic}' +
      '#crs-banner{position:sticky;top:0;z-index:8000;background:#b91c1c;color:#fff;text-align:center;font:600 13px/1.4 inherit;padding:6px 10px}';
    document.head.appendChild(st);
  }
  function showFallback(text, title) {
    ensureStyles();
    var old = document.getElementById('crs-fallback'); if (old) old.parentNode.removeChild(old);
    var wrap = document.createElement('div'); wrap.id = 'crs-fallback';
    wrap.innerHTML = '<div class="crs-box" role="dialog" aria-modal="true" aria-labelledby="crs-title"><h4 id="crs-title"></h4>' +
      '<p>Your browser did not allow automatic copying. The text below is selected \u2014 press Ctrl+C (Cmd+C on a Mac), or long-press and choose Copy on a phone.</p>' +
      '<textarea id="crs-text" readonly></textarea><div class="crs-actions"><button type="button" id="crs-close">Done</button></div></div>';
    document.body.appendChild(wrap);
    document.getElementById('crs-title').textContent = title || 'Copy';
    var ta = document.getElementById('crs-text'); ta.value = text; ta.focus(); ta.select();
    document.getElementById('crs-close').addEventListener('click', function () { wrap.parentNode.removeChild(wrap); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) wrap.parentNode.removeChild(wrap); });
  }
  function copyToClipboard(text, btn, okLabel, fallbackTitle) {
    function done(ok) {
      if (btn) { var t0 = btn.textContent; btn.textContent = ok ? (okLabel || '\u2713 Copied') : t0; setTimeout(function () { btn.textContent = t0; }, 3000); }
      if (!ok) showFallback(text, fallbackTitle);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else { done(false); }
  }

  // ---------- dictation (speech-to-text) ----------
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var activeRec = null;
  function stopDictation() { if (activeRec) { try { activeRec._stop(); } catch (e) {} } }
  function attachDictation(selector) {
    if (!SR) return 0;
    ensureStyles();
    var n = 0;
    document.querySelectorAll(selector).forEach(function (ta) {
      if (ta.getAttribute('data-dictate') === 'done') return;
      ta.setAttribute('data-dictate', 'done');
      var wrap = document.createElement('div'); wrap.className = 'crs-dictate-wrap';
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'crs-dictate';
      btn.innerHTML = '&#127908; Dictate'; btn.setAttribute('aria-label', 'Dictate into this box');
      var interim = document.createElement('span'); interim.className = 'crs-interim'; interim.setAttribute('aria-live', 'polite');
      wrap.appendChild(btn); wrap.appendChild(interim);
      ta.parentNode.insertBefore(wrap, ta.nextSibling);
      var rec = null, on = false;
      function setOn(v) { on = v; btn.classList.toggle('on', v); btn.innerHTML = v ? '&#9632; Stop' : '&#127908; Dictate'; if (!v) interim.textContent = ''; }
      function start() {
        stopDictation();
        rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = document.documentElement.lang || 'en-US';
        rec.onresult = function (ev) {
          var fin = '', tmp = '';
          for (var i = ev.resultIndex; i < ev.results.length; i++) {
            var t = ev.results[i][0].transcript;
            if (ev.results[i].isFinal) fin += t; else tmp += t;
          }
          if (fin) {
            var cur = ta.value; ta.value = cur + (cur && !/\s$/.test(cur) ? ' ' : '') + fin.trim();
            ta.dispatchEvent(new Event('input', { bubbles: true }));
          }
          interim.textContent = tmp;
        };
        rec.onend = function () { if (on) { try { rec.start(); } catch (e) { setOn(false); } } };
        rec.onerror = function (ev) { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { setOn(false); interim.textContent = 'Microphone blocked \u2014 check browser permissions.'; } };
        rec._stop = function () { on = false; setOn(false); try { rec.stop(); } catch (e) {} if (activeRec === rec) activeRec = null; };
        activeRec = rec; setOn(true);
        try { rec.start(); } catch (e) { setOn(false); }
      }
      btn.addEventListener('click', function () { if (on) rec._stop(); else start(); });
      n++;
    });
    return n;
  }

  // ---------- Qualtrics hidden-form POST ----------
  function qualtricsPost(url, payload, keepMs) {
    var frameName = 'qualtrics_frame_' + Date.now();
    var iframe = document.createElement('iframe');
    iframe.name = frameName; iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:absolute;width:1px;height:1px;border:0;visibility:hidden;';
    document.body.appendChild(iframe);                     // always on <body>: screen redraws must not destroy it
    var form = document.createElement('form');
    form.method = 'POST'; form.action = url; form.target = frameName; form.acceptCharset = 'UTF-8'; form.style.display = 'none';
    for (var key in payload) {
      if (payload.hasOwnProperty(key)) {
        var input = document.createElement('input'); input.type = 'hidden'; input.name = key; input.value = String(payload[key]);
        form.appendChild(input);
      }
    }
    document.body.appendChild(form);
    form.submit();
    setTimeout(function () {
      if (form.parentNode) form.parentNode.removeChild(form);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, keepMs || 60000);
    return true;
  }

  // ---------- demo stand-in for the SCORM wrapper ----------
  function demoSCORM() {
    var mem = {};
    function g(k) { return mem[k] || ''; }
    function s(k, v) { mem[k] = String(v); }
    return {
      init: function () { return false; }, terminate: function () {}, commit: function () {},
      isStandalone: function () { return true; },
      getValue: g, setValue: s,
      getSuspendData: function () { try { return g('cmi.suspend_data') ? JSON.parse(g('cmi.suspend_data')) : {}; } catch (e) { return {}; } },
      setSuspendData: function (d) { s('cmi.suspend_data', JSON.stringify(d)); },
      setLocation: function (p) { s('cmi.location', p); }, getLocation: function () { return g('cmi.location') || '1'; },
      getLearnerID: function () { return ''; }, getLearnerName: function () { return ''; },
      setScore: function () {}, setComplete: function () {}, setProgressMeasure: function () {},
      setInteraction: function () {}, reset: function () { mem = {}; }
    };
  }

  function banner(text) {
    ensureStyles();
    if (document.getElementById('crs-banner')) return;
    var b = document.createElement('div'); b.id = 'crs-banner'; b.textContent = text;
    document.body.insertBefore(b, document.body.firstChild);
  }

  return {
    isLMS: isLMS, timer: timer, formatUnlock: formatUnlock, resume: resume,
    copyToClipboard: copyToClipboard, showFallback: showFallback,
    attachDictation: attachDictation, stopDictation: stopDictation, dictationSupported: !!SR,
    qualtricsPost: qualtricsPost, demoSCORM: demoSCORM, banner: banner
  };
})();
