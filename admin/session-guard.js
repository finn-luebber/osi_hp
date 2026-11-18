/**
 * Keeps the editor's GitHub/GitLab login in the browser only as long as it is needed:
 *   - Closing the editor tab logs out (reloading the page does not).
 *   - After 30 minutes without activity in any editor tab, the editor logs out.
 *     Two minutes before, a notice offers to stay logged in.
 * Runs before the editor starts. The editor (Decap CMS) keeps its login under "decap-cms-user".
 */
(function () {
  'use strict';
  var LOGIN = 'decap-cms-user';
  var HELD = 'osi-editor-held-login';       // this tab's login while the page reloads (sessionStorage)
  var TABS = 'osi-editor-tabs';             // which editor tabs are open (localStorage)
  var LAST = 'osi-editor-last-activity';    // time of the last activity in any editor tab (localStorage)
  var TIMED_OUT = 'osi-editor-timed-out';   // shows a note after an automatic logout (sessionStorage)
  var IDLE_LIMIT = 30 * 60 * 1000;
  var WARN_BEFORE = 2 * 60 * 1000;
  var BEAT = 10 * 1000;
  var tabId = Math.random().toString(36).slice(2);
  var now = function () { return Date.now(); };

  function read(store, key) { try { return store.getItem(key); } catch (e) { return null; } }
  function write(store, key, value) { try { if (value === null) { store.removeItem(key); } else { store.setItem(key, value); } } catch (e) { /* storage blocked */ } }
  function openTabs() {
    var tabs = {};
    try { tabs = JSON.parse(read(localStorage, TABS) || '{}') || {}; } catch (e) { tabs = {}; }
    var fresh = {};
    Object.keys(tabs).forEach(function (id) { if (now() - tabs[id] < 3 * BEAT) { fresh[id] = tabs[id]; } });
    return fresh;
  }
  function beat(remove) {
    var tabs = openTabs();
    if (remove) { delete tabs[tabId]; } else { tabs[tabId] = now(); }
    write(localStorage, TABS, JSON.stringify(tabs));
    return tabs;
  }
  function lastActivity() { return Number(read(localStorage, LAST)) || 0; }
  function touch() { write(localStorage, LAST, String(now())); }

  // 1. Starting up: bring back this tab's login after a reload; drop a login left behind by a closed tab.
  var held = read(sessionStorage, HELD);
  write(sessionStorage, HELD, null);
  if (held) {
    write(localStorage, LOGIN, held);
  } else if (read(localStorage, LOGIN) && Object.keys(openTabs()).length === 0) {
    write(localStorage, LOGIN, null);
  }
  if (read(localStorage, LOGIN) && now() - lastActivity() >= IDLE_LIMIT && Object.keys(openTabs()).length === 0) {
    write(localStorage, LOGIN, null);
  }
  beat(false);
  touch();
  setInterval(function () { beat(false); }, BEAT);

  // 2. Leaving the page: keep the login only for this tab (it comes back on reload), not on disk.
  window.addEventListener('pagehide', function () {
    var login = read(localStorage, LOGIN);
    var others = beat(true);
    if (login) { write(sessionStorage, HELD, login); }
    if (Object.keys(others).length === 0) { write(localStorage, LOGIN, null); }
  });

  // 3. Activity in any editor tab keeps the login alive.
  var lastTouch = 0;
  ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'].forEach(function (type) {
    window.addEventListener(type, function (e) {
      if (notice && notice.contains(e.target)) { return; }   // the notice's own button handles itself
      if (now() - lastTouch > 5000) { lastTouch = now(); touch(); hideNotice(); }
    }, { capture: true, passive: true });
  });

  // 4. Notice and automatic logout.
  var notice = null;
  function showNotice(text, withButton) {
    if (!notice) {
      notice = document.createElement('div');
      notice.setAttribute('role', 'alert');
      notice.style.cssText = 'position:fixed;z-index:99999;left:50%;bottom:24px;transform:translateX(-50%);max-width:calc(100% - 32px);' +
        'display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding:14px 18px;background:#00323D;color:#fff;' +
        'font:15px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);border-radius:4px';
      document.body.appendChild(notice);
    }
    notice.textContent = '';
    var span = document.createElement('span');
    span.textContent = text;
    notice.appendChild(span);
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = withButton ? 'Stay logged in' : 'OK';
    button.style.cssText = 'min-height:36px;padding:0 14px;border:1px solid #fff;border-radius:2px;background:#fff;color:#00323D;font:inherit;font-weight:600;cursor:pointer';
    button.addEventListener('click', function () { touch(); hideNotice(); });
    notice.appendChild(button);
  }
  function hideNotice() { if (notice) { notice.remove(); notice = null; } }

  function check() {
    if (!read(localStorage, LOGIN)) { return; }
    var idle = now() - lastActivity();
    if (idle >= IDLE_LIMIT) {
      write(localStorage, LOGIN, null);
      write(sessionStorage, HELD, null);
      write(sessionStorage, TIMED_OUT, '1');
      window.location.reload();
    } else if (idle >= IDLE_LIMIT - WARN_BEFORE) {
      var minutes = Math.max(1, Math.ceil((IDLE_LIMIT - idle) / 60000));
      showNotice('For security, you will be logged out in ' + minutes + (minutes === 1 ? ' minute' : ' minutes') + ' because nothing happened in the editor.', true);
    }
  }
  setInterval(check, 15 * 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { check(); } });
  window.addEventListener('storage', function (e) {
    if (e.key === LAST) { hideNotice(); }
    if (e.key === LOGIN && !e.newValue && read(sessionStorage, HELD) === null && document.visibilityState) { /* another tab logged out */ }
  });

  if (read(sessionStorage, TIMED_OUT)) {
    write(sessionStorage, TIMED_OUT, null);
    var ready = function () { showNotice('You were logged out after 30 minutes without activity. Please log in again.', false); };
    if (document.body) { ready(); } else { document.addEventListener('DOMContentLoaded', ready); }
  }
})();
