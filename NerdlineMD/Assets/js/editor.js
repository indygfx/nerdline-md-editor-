/**
 * Nerdline MD Editor - glue code.
 *
 * Attaches EasyMDE (side-by-side preview) to every task description
 * textarea (name="description"). Kanboard loads its edit modals via
 * AJAX, so a MutationObserver re-runs the attach logic for dynamically
 * injected forms. EasyMDE syncs its content back to the original
 * textarea on form submit, so Kanboard's save logic stays untouched.
 */
(function () {
    'use strict';

    var ATTACHED_FLAG = 'data-nerdline-md-attached';

    // Registry: textarea -> EasyMDE instance, so external code can reach
    // the editors (used for the headline jump after a click on .nmsclickme).
    var editors = [];

    /**
     * Decode HTML entities and strip tags, so the clicked headline
     * (data-content, e.g. "<strong>2. Asbest...</strong>") can be
     * compared against plain markdown lines in the editor.
     * @param {string} html
     * @return {string} plain text
     */
    function htmlToPlainText(html) {
        var el = document.createElement('textarea');
        el.innerHTML = html;
        var decoded = el.value;

        var div = document.createElement('div');
        div.innerHTML = decoded;
        return (div.textContent || '').replace(/\s+/g, ' ').trim();
    }

    /**
     * Normalize a markdown line the same way: drop markdown markup
     * characters so "# **2. Asbest...**" matches "2. Asbest...".
     * @param {string} line
     * @return {string}
     */
    function normalizeMarkdownLine(line) {
        return line
            .replace(/^\s*#{1,6}\s*/, '')
            .replace(/\*\*__/g, '')
            .replace(/__/g, '')
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/~~/g, '')
            .replace(/`/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Jump to the headline matching the given text in the given editor.
     * Scrolls the CodeMirror view to the line, places the cursor there
     * and briefly flashes the line for visual feedback.
     * @param {EasyMDE} editor
     * @param {string} headlineText
     * @return {boolean} true if a matching line was found
     */
    function jumpToHeadlineInEditor(editor, headlineText) {
        if (!headlineText) {
            return false;
        }

        var cm = editor.codemirror;
        var lines = cm.lineCount();
        var target = -1;

        for (var i = 0; i < lines; i++) {
            var normalized = normalizeMarkdownLine(cm.getLine(i));
            if (normalized !== '' && normalized === headlineText) {
                target = i;
                break;
            }
        }

        if (target === -1) {
            // Fallback: line contains the headline text
            for (var j = 0; j < lines; j++) {
                var candidate = normalizeMarkdownLine(cm.getLine(j));
                if (candidate !== '' && candidate.indexOf(headlineText) !== -1) {
                    target = j;
                    break;
                }
            }
        }

        if (target === -1) {
            return false;
        }

        cm.setCursor({ line: target, ch: 0 });
        cm.scrollIntoView({ line: target, ch: 0 }, 80);
        cm.focus();

        var FLASH_CLASS = 'nerdline-md-flash';
        var lineEl = cm.addLineClass(target, 'background', FLASH_CLASS);
        setTimeout(function () {
            cm.removeLineClass(target, 'background', FLASH_CLASS);
        }, 1500);

        return true;
    }

    /**
     * Jump to the headline given by the global variable
     * `datacontentclicked` (set by the page when a .nmsclickme edit icon
     * was clicked). Searches all attached editors.
     * @return {boolean} true if the jump happened
     */
    function jumpFromGlobalVar() {
        var clicked = window.datacontentclicked;
        if (!clicked) {
            return false;
        }

        var headlineText = htmlToPlainText(String(clicked));
        if (!headlineText) {
            return false;
        }

        // Prune dead editors first: Kanboard rebuilds the modal DOM on
        // re-opening, so closed modals leave orphaned EasyMDE instances in
        // the registry. A jump into an orphan would silently "succeed"
        // without any visible effect.
        var live = [];
        for (var i = 0; i < editors.length; i++) {
            var element = editors[i].element;
            if (element && element.isConnected) {
                live.push(editors[i]);
            }
        }
        editors.length = 0;
        for (var j = 0; j < live.length; j++) {
            editors.push(live[j]);
        }


        // Prefer editors inside the currently open modal
        var modalContent = document.getElementById('modal-content');

        for (var k = 0; k < editors.length; k++) {
            var el = editors[k].element;
            var inModal = modalContent && modalContent.contains(el);
            if (inModal && jumpToHeadlineInEditor(editors[k], headlineText)) {
                return true;
            }
        }
        // Fallback: any live editor (e.g. static page forms)
        for (var m = 0; m < editors.length; m++) {
            if (jumpToHeadlineInEditor(editors[m], headlineText)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Public API: jump from external code to a headline.
     * Accepts raw markdown or HTML-encoded headline text.
     * @param {string} headline
     * @return {boolean} true if the jump happened
     */
    function jumpToHeadline(headline) {
        var headlineText = htmlToPlainText(String(headline || ''));
        if (!headlineText) {
            return false;
        }
        for (var i = 0; i < editors.length; i++) {
            if (jumpToHeadlineInEditor(editors[i], headlineText)) {
                return true;
            }
        }
        return false;
    }

    var HIDE_CLASS = 'nerdline-md-hidden';
    var VISIBLE_CLASS = 'nerdline-md-visible';
    var SAVE_HIDE_DELAY = 2500;

    // Deferred headline jump. Runs on a short timer so the modal and the
    // editor are fully rendered when the CodeMirror position is measured.
    var pendingJumpTimer = null;

    /**
     * Queue the headline jump from `window.datacontentclicked`. Called
     * whenever the DOM changes (modal opened/reopened) and when a new
     * editor attaches - Kanboard reuses the modal DOM on re-opening, so
     * the jump cannot be tied to the attach step alone.
     */
    function queueHeadlineJump() {
        if (pendingJumpTimer) {
            clearTimeout(pendingJumpTimer);
        }
        pendingJumpTimer = setTimeout(function () {
            pendingJumpTimer = null;
            if (jumpFromGlobalVar()) {
                window.datacontentclicked = null;
            }
        }, 150);
    }

    /**
     * Hide Kanboard's default markdown toolbar that belongs to the
     * given textarea. The toolbar precedes the textarea inside the
     * same parent, so the previous sibling is checked. Only the
     * matched toolbar gets the class - other text-editor toolbars
     * on the page stay untouched.
     * @param {HTMLTextAreaElement} textarea
     */
    function hideKanboardToolbar(textarea) {
        var prev = textarea.previousElementSibling;
        while (prev && prev !== textarea) {
            if (prev.classList && prev.classList.contains('text-editor-toolbar')) {
                prev.classList.add(HIDE_CLASS);
                return;
            }
            prev = prev.previousElementSibling;
        }
    }

    /**
     * Find the closest scrollable ancestor of the given element.
     * Kanboard modals scroll in #modal-box, regular pages in window.
     * @param {HTMLElement} el
     * @return {HTMLElement|Window} the scrolling container
     */
    function findScrollContainer(el) {
        var node = el.parentNode;
        while (node && node !== document.body) {
            if (node instanceof HTMLElement) {
                var style = window.getComputedStyle(node);
                var overflowY = style.overflowY;
                var scrolls = (overflowY === 'auto' || overflowY === 'scroll');
                if (scrolls && node.scrollHeight > node.clientHeight) {
                    return node;
                }
            }
            node = node.parentNode;
        }
        return window;
    }

    /**
     * Read the current scroll position of a scroll container (element or
     * window), shared by the floating save and scroll-down buttons.
     * @param {HTMLElement|Window} scrollContainer
     * @return {number}
     */
    function currentScrollTopOf(scrollContainer) {
        return scrollContainer instanceof HTMLElement
            ? scrollContainer.scrollTop
            : (window.scrollY || window.pageYOffset);
    }

    /**
     * Position a floating button at the bottom of the scroll container,
     * either on the left or right side.
     * @param {HTMLElement} button
     * @param {HTMLElement|Window} scrollContainer
     * @param {string} side 'left' or 'right'
     */
    function positionFloatingButton(button, scrollContainer, side) {
        if (scrollContainer instanceof HTMLElement) {
            var rect = scrollContainer.getBoundingClientRect();
            button.style.bottom = (window.innerHeight - rect.bottom + 10) + 'px';
            if (side === 'right') {
                button.style.left = 'auto';
                button.style.right = (window.innerWidth - rect.right + 10) + 'px';
            } else {
                button.style.right = 'auto';
                button.style.left = (rect.left + 10) + 'px';
            }
        } else {
            button.style.bottom = '10px';
            if (side === 'right') {
                button.style.left = 'auto';
                button.style.right = '10px';
            } else {
                button.style.right = 'auto';
                button.style.left = '10px';
            }
        }
    }

    /**
     * Show a floating save button at the bottom left of the modal while
     * the user scrolls down and the form's submit buttons are scrolled
     * out of view. A timer hides it again; scrolling down re-triggers the
     * show. Clicking it submits the surrounding form (Kanboard's save).
     * @param {EasyMDE} editor
     */
    /**
     * Shared fancy tooltip for the floating buttons. One element per
     * page, positioned above the hovered button. The tooltip text is
     * taken from the button's data-tooltip attribute.
     */
    var tooltipEl = null;
    var tooltipHideTimer = null;

    function getTooltip() {
        if (!tooltipEl || !tooltipEl.isConnected) {
            tooltipEl = document.createElement('div');
            tooltipEl.className = 'nerdline-md-tooltip';
            document.body.appendChild(tooltipEl);
        }
        return tooltipEl;
    }

    function showTooltip(button) {
        var text = button.getAttribute('data-tooltip');
        if (!text) {
            return;
        }
        var tip = getTooltip();
        tip.textContent = text;

        var rect = button.getBoundingClientRect();
        tip.style.left = '0';
        tip.style.top = '0';
        tip.classList.add('nerdline-md-tooltip-visible');

        // Measure after making visible, then center above the button
        var tipRect = tip.getBoundingClientRect();
        tip.style.left = Math.round(rect.left + rect.width / 2 - tipRect.width / 2) + 'px';
        tip.style.top = Math.round(rect.top - tipRect.height - 8) + 'px';
    }

    function hideTooltip() {
        if (tooltipEl && tooltipEl.isConnected) {
            tooltipEl.classList.remove('nerdline-md-tooltip-visible');
        }
    }

    function attachTooltip(button) {
        button.addEventListener('mouseenter', function () {
            if (tooltipHideTimer) {
                clearTimeout(tooltipHideTimer);
                tooltipHideTimer = null;
            }
            showTooltip(button);
        });
        button.addEventListener('mouseleave', function () {
            // Small delay so moving between the two buttons feels smooth
            tooltipHideTimer = setTimeout(hideTooltip, 80);
        });
    }

    /**
     * Shared wrapper for the floating buttons (save left, scroll-down
     * right) so both sit on the same line at the bottom of the editor
     * container, with the same sticky behavior.
     * @param {HTMLElement} container EasyMDE container element
     * @return {HTMLElement} the button wrapper element
     */
    function getFloatingButtonWrapper(container) {
        var wrapper = container.querySelector('.nerdline-md-floating-buttons');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'nerdline-md-floating-buttons';
            container.appendChild(wrapper);
        }
        return wrapper;
    }

    function setupFloatingSave(editor) {
        var container = editor.gui.toolbar.parentNode;
        if (!container || container.querySelector('.nerdline-md-floating-save')) {
            return;
        }

        var form = editor.element.form || editor.element.closest('form');
        if (!form) {
            return;
        }

        var submitButtons = form.querySelector('.form-actions');
        var scrollContainer = findScrollContainer(container);

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'nerdline-md-floating-save';
        button.textContent = 'Save';
        button.setAttribute('data-tooltip', '4lw4y5 54v3 y0ur W0rk');
        attachTooltip(button);
        getFloatingButtonWrapper(container).appendChild(button);

        button.addEventListener('click', function () {
            form.submit();
        });

        function positionButton() {
            positionFloatingButton(button, scrollContainer, 'left');
        }

        var hideTimer = null;
        var lastTriggered = 0;
        var lastScrollTop = currentScrollTopOf(scrollContainer);

        // Hover pause: while the mouse rests on the button, the hide
        // timer is paused; on mouseleave it resumes with the full delay.
        var hoverPaused = false;

        function hide() {
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
            button.classList.remove(VISIBLE_CLASS);
        }

        function show() {
            positionButton();
            button.classList.add(VISIBLE_CLASS);
            if (hideTimer) {
                clearTimeout(hideTimer);
            }
            if (!hoverPaused) {
                hideTimer = setTimeout(function () {
                    if (hoverPaused) {
                        return;
                    }
                    button.classList.remove(VISIBLE_CLASS);
                    hideTimer = null;
                }, SAVE_HIDE_DELAY);
            }
        }

        button.addEventListener('mouseenter', function () {
            hoverPaused = true;
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
        });
        button.addEventListener('mouseleave', function () {
            hoverPaused = false;
            if (button.classList.contains(VISIBLE_CLASS)) {
                hideTimer = setTimeout(function () {
                    if (hoverPaused) {
                        return;
                    }
                    button.classList.remove(VISIBLE_CLASS);
                    hideTimer = null;
                }, SAVE_HIDE_DELAY);
            }
        });

        function onScroll() {
            if (!submitButtons || !submitButtons.isConnected) {
                return;
            }

            var scrollTop = currentScrollTopOf(scrollContainer);
            var scrollingUp = scrollTop < lastScrollTop;
            lastScrollTop = scrollTop;

            // Any upward scrolling hides the button immediately
            if (scrollingUp) {
                hide();
                return;
            }

            var box = submitButtons.getBoundingClientRect();
            var viewTop = 0;
            var viewBottom = window.innerHeight;
            if (scrollContainer instanceof HTMLElement) {
                var containerRect = scrollContainer.getBoundingClientRect();
                viewTop = containerRect.top;
                viewBottom = containerRect.bottom;
            }
            var buttonsVisible = box.bottom > viewTop && box.top < viewBottom;
            if (!buttonsVisible) {
                var now = Date.now();
                // Only re-trigger after the hide animation finished,
                // otherwise every scroll pixel restarts the timer
                if (!button.classList.contains(VISIBLE_CLASS) || now - lastTriggered > SAVE_HIDE_DELAY) {
                    lastTriggered = now;
                    show();
                }
            } else {
                // Scrolled back up to the regular submit buttons:
                // hide the floating button immediately
                hide();
            }
        }

        if (scrollContainer instanceof HTMLElement) {
            scrollContainer.addEventListener('scroll', onScroll);
        } else {
            window.addEventListener('scroll', onScroll, true);
        }
        window.addEventListener('resize', positionButton);
    }

    /**
     * Floating scroll-down button at the bottom right of the modal, same
     * presentation logic as the floating save button (slides up only on
     * downward scrolling, hides on upward scrolling and after a timeout).
     * Appears when the task settings below the editor are out of view;
     * clicking scrolls smoothly down to them.
     * @param {EasyMDE} editor
     */
    function setupScrollDown(editor) {
        var container = editor.gui.toolbar.parentNode;
        if (!container || container.querySelector('.nerdline-md-scroll-down')) {
            return;
        }

        var form = editor.element.form || editor.element.closest('form');
        if (!form) {
            return;
        }

        // The task settings live in the secondary columns below the editor
        var target = form.querySelector('.task-form-secondary-column');
        var scrollContainer = findScrollContainer(container);

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'nerdline-md-scroll-down';
        button.title = 'Scroll to task settings';
        button.setAttribute('aria-label', 'Scroll to task settings');
        button.setAttribute('data-tooltip', 'G0 D0wn');
        attachTooltip(button);
        button.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>';
        getFloatingButtonWrapper(container).appendChild(button);

        button.addEventListener('click', function () {
            if (target && target.isConnected) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else if (scrollContainer instanceof HTMLElement) {
                scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
            } else {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            }
        });

        var hideTimer = null;
        var lastTriggered = 0;
        var lastScrollTop = currentScrollTopOf(scrollContainer);

        // Hover pause: while the mouse rests on the button, the hide
        // timer is paused; on mouseleave it resumes with the full delay.
        var hoverPaused = false;

        function hide() {
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
            button.classList.remove(VISIBLE_CLASS);
        }

        function show() {
            button.classList.add(VISIBLE_CLASS);
            if (hideTimer) {
                clearTimeout(hideTimer);
            }
            if (!hoverPaused) {
                hideTimer = setTimeout(function () {
                    if (hoverPaused) {
                        return;
                    }
                    button.classList.remove(VISIBLE_CLASS);
                    hideTimer = null;
                }, SAVE_HIDE_DELAY);
            }
        }

        button.addEventListener('mouseenter', function () {
            hoverPaused = true;
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
        });
        button.addEventListener('mouseleave', function () {
            hoverPaused = false;
            if (button.classList.contains(VISIBLE_CLASS)) {
                hideTimer = setTimeout(function () {
                    if (hoverPaused) {
                        return;
                    }
                    button.classList.remove(VISIBLE_CLASS);
                    hideTimer = null;
                }, SAVE_HIDE_DELAY);
            }
        });

        function onScroll() {
            if (!target || !target.isConnected) {
                return;
            }

            var scrollTop = currentScrollTopOf(scrollContainer);
            var scrollingUp = scrollTop < lastScrollTop;
            lastScrollTop = scrollTop;

            // Any upward scrolling hides the button immediately
            if (scrollingUp) {
                hide();
                return;
            }

            var box = target.getBoundingClientRect();
            var viewTop = 0;
            var viewBottom = window.innerHeight;
            if (scrollContainer instanceof HTMLElement) {
                var containerRect = scrollContainer.getBoundingClientRect();
                viewTop = containerRect.top;
                viewBottom = containerRect.bottom;
            }
            var targetVisible = box.bottom > viewTop && box.top < viewBottom;
            if (!targetVisible) {
                var now = Date.now();
                if (!button.classList.contains(VISIBLE_CLASS) || now - lastTriggered > SAVE_HIDE_DELAY) {
                    lastTriggered = now;
                    show();
                }
            } else {
                // Task settings are in view again: hide immediately
                hide();
            }
        }

        if (scrollContainer instanceof HTMLElement) {
            scrollContainer.addEventListener('scroll', onScroll);
        } else {
            window.addEventListener('scroll', onScroll, true);
        }
    }

    /**
     * Create an EasyMDE instance on the given textarea.
     * @param {HTMLTextAreaElement} textarea
     */
    function attachEditor(textarea) {
        // Guard against double initialization
        if (textarea.hasAttribute(ATTACHED_FLAG)) {
            return;
        }
        textarea.setAttribute(ATTACHED_FLAG, '1');

        var editor = new EasyMDE({
            element: textarea,
            sideBySideFullscreen: false,
            spellChecker: false,
            status: false,
            autoDownloadFontAwesome: false,
            toolbar: [
                'bold', 'italic', 'strikethrough', 'heading', '|',
                'unordered-list', 'ordered-list', 'quote', '|',
                'link', 'image', 'code', 'table', '|',
                'preview', 'side-by-side', '|',
                'guide'
            ],
            // GFM-flavored shortcuts that Kanboard users expect
            shortcuts: {
                toggleSideBySide: 'F9',
                togglePreview: 'F10'
            }

         });

        hideKanboardToolbar(textarea);

        editors.push(editor);

        // EasyMDE keeps the text in its CodeMirror instance and never
        // writes it back to the original textarea on its own. Kanboard
        // serializes the (hidden) textarea when saving the task, so the
        // value must be mirrored on every change - covers typing as well
        // as toolbar actions, and AJAX-submitted modal forms.
        editor.codemirror.on('change', function () {
            textarea.value = editor.value();
        });

        // If the editor was opened because a .nmsclickme edit icon was
        // clicked, the page has put the clicked headline into the global
        // `datacontentclicked`. Queue the jump (debounced).
        queueHeadlineJump();

        setupFloatingSave(editor);
        setupScrollDown(editor);
    }

    /**
     * Find and initialize all not-yet-attached description textareas.
     */
    function scan() {
        var textareas = document.querySelectorAll('textarea[name="description"]');
        for (var i = 0; i < textareas.length; i++) {
            attachEditor(textareas[i]);
        }

        // Modal was (re)opened with a pending headline jump - the editor
        // may already be attached from a previous open, so re-check on
        // every scan instead of only at attach time.
        queueHeadlineJump();
    }

    // Initial run for statically rendered forms (task creation page)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scan);
    } else {
        scan();
    }

    // Re-run when Kanboard injects AJAX modals (task edit description)
    var observer = new MutationObserver(function () {
        scan();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Public API for the page's click handler on .nmsclickme:
    // either set window.datacontentclicked before opening the editor
    // (the jump happens automatically once the editor attached), or
    // call NerdlineMD.jumpToHeadline('<strong>...</strong>') directly.
    window.NerdlineMD = {
        jumpToHeadline: jumpToHeadline
    };
})();
