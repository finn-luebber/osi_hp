// Menu on small displays: the three-bar button opens and closes the list of page links.
(function () {
  document.documentElement.classList.add('js');
  requestAnimationFrame(function () { requestAnimationFrame(function () { document.documentElement.classList.add('js-ready'); }); });
  document.querySelectorAll('.site-header').forEach(function (header) {
    var button = header.querySelector('.site-menu-btn');
    var nav = header.querySelector('.site-nav');
    if (!button || !nav) { return; }
    function set(open) {
      header.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    button.addEventListener('click', function () { set(!header.classList.contains('is-open')); });
    nav.addEventListener('click', function (event) { if (event.target.closest('a')) { set(false); } });
    document.addEventListener('click', function (event) { if (!header.contains(event.target)) { set(false); } });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && header.classList.contains('is-open')) { set(false); button.focus(); }
    });
  });
})();

// The site is built ahead of time. Dates that have passed since the last build are
// tidied up here, so the "Upcoming" box and the date blocks stay right between builds.
(function () {
  var today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  document.querySelectorAll('.osi-eventsbox').forEach(function (box) {
    var list = box.querySelector('ul');
    if (!list) { return; }
    var shown = 0;
    Array.prototype.slice.call(list.querySelectorAll('li[data-last]')).forEach(function (item) {
      if (item.getAttribute('data-last') < today) { item.remove(); return; }
      item.hidden = shown >= 3;
      shown += 1;
    });
    list.hidden = shown === 0;
    var empty = box.querySelector('.osi-eventsbox__empty');
    if (empty) { empty.hidden = shown > 0; }
  });
  document.querySelectorAll('.osi-event__date[data-last]').forEach(function (block) {
    if (block.getAttribute('data-last') < today) { block.classList.add('osi-event__date--past'); }
  });
})();
