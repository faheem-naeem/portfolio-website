// Progressive enhancement: replaces the static timezone text inside every
// <time data-tz="..."> with the live local time in that zone, once a minute.
// Without JavaScript the element keeps its build-time timezone + UTC offset text.
(function () {
    'use strict';
    var els = document.querySelectorAll('time[data-tz]');
    if (!els.length || typeof Intl === 'undefined') return;

    var clocks = [];
    els.forEach(function (el) {
        try {
            clocks.push({
                el: el,
                fmt: new Intl.DateTimeFormat('en', {
                    timeZone: el.getAttribute('data-tz'),
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZoneName: 'short',
                }),
            });
        } catch (e) {
            // Unknown timezone in this browser: keep the static fallback text.
        }
    });

    function tick() {
        var now = new Date();
        clocks.forEach(function (c) {
            c.el.textContent = c.fmt.format(now);
            c.el.setAttribute('datetime', now.toISOString());
        });
    }

    tick();
    // Align updates to the start of each minute.
    setTimeout(function () {
        tick();
        setInterval(tick, 60000);
    }, 60000 - (Date.now() % 60000));
})();
