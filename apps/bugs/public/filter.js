// Progressive enhancement for the home page filters. Without JS the filter
// links open static pages (/tag/<tag>/ etc.); with JS they filter in place.
(function () {
    'use strict';
    var gallery = document.querySelector('[data-gallery]');
    var nav = document.querySelector('[data-filters]');
    if (!gallery || !nav || !window.history || !history.pushState) return;

    var cards = gallery.querySelectorAll('.card');
    var heading = gallery.querySelector('[data-gallery-heading]');
    var count = gallery.querySelector('[data-gallery-count]');
    var links = nav.querySelectorAll('a[data-filter-kind]');
    var pattern = /^\/(tag|stack|severity)\/([a-z0-9-]+)\/?$/;

    function apply(kind, value) {
        var shown = 0;
        cards.forEach(function (card) {
            var values = kind
                ? (card.getAttribute('data-' + kind) || '').split(' ')
                : [];
            var match = !kind || values.indexOf(value) !== -1;
            card.hidden = !match;
            if (match) shown += 1;
        });
        var label = 'All exhibits';
        links.forEach(function (link) {
            var active =
                link.getAttribute('data-filter-kind') === kind &&
                link.getAttribute('data-filter-value') === value;
            if (active) {
                link.setAttribute('aria-current', 'page');
                if (kind)
                    label = link.getAttribute('data-filter-label') || label;
            } else {
                link.removeAttribute('aria-current');
            }
        });
        if (heading) heading.textContent = label;
        if (count)
            count.textContent =
                'Showing ' + shown + (shown === 1 ? ' exhibit.' : ' exhibits.');
    }

    function fromPath(path) {
        var m = pattern.exec(path);
        return m ? { kind: m[1], value: m[2] } : { kind: '', value: '' };
    }

    nav.addEventListener('click', function (event) {
        var link =
            event.target.closest && event.target.closest('a[data-filter-kind]');
        if (
            !link ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0
        )
            return;
        event.preventDefault();
        var kind = link.getAttribute('data-filter-kind');
        var value = link.getAttribute('data-filter-value');
        apply(kind, value);
        history.pushState(
            { kind: kind, value: value },
            '',
            link.getAttribute('href'),
        );
    });

    window.addEventListener('popstate', function () {
        var state = fromPath(location.pathname);
        if (location.pathname === '/' || state.kind)
            apply(state.kind, state.value);
        else location.reload();
    });
})();
