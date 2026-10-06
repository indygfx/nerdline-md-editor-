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

        for (var i = 0; i < editors.length; i++) {
            if (jumpToHeadlineInEditor(editors[i], headlineText)) {
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
    var SCROLL_TRIGGER_LINES = 15;

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
     * Show a floating save button at the bottom left on top of the
     * editor while the user scrolls down inside the document. A timer
     * hides it again; scrolling down re-triggers the show. Clicking it
     * submits the surrounding form (Kanboard's regular save logic).
     * @param {EasyMDE} editor
     */
    function setupFloatingSave(editor) {
        var container = editor.gui.toolbar.parentNode;
        if (!container || container.querySelector('.nerdline-md-floating-save')) {
            return;
        }

        var form = editor.element.form || editor.element.closest('form');
        if (!form) {
            return;
        }

        container.style.position = 'relative';

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'nerdline-md-floating-save';
        button.textContent = 'Save';
        container.appendChild(button);

        button.addEventListener('click', function () {
            form.submit();
        });

        var hideTimer = null;

        function show() {
            button.classList.add(VISIBLE_CLASS);
            if (hideTimer) {
                clearTimeout(hideTimer);
            }
            hideTimer = setTimeout(function () {
                button.classList.remove(VISIBLE_CLASS);
                hideTimer = null;
            }, SAVE_HIDE_DELAY);
        }

        editor.codemirror.on('scroll', function (cm) {
            var scrollInfo = cm.getScrollInfo();
            // Only react to downward scrolling past the trigger depth
            if (scrollInfo.top > SCROLL_TRIGGER_LINES * cm.defaultTextHeight()) {
                show();
            }
        });
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
        // `datacontentclicked`. Jump to that headline and consume it.
        setTimeout(function () {
            if (jumpFromGlobalVar()) {
                window.datacontentclicked = null;
            }
        }, 150);

        setupFloatingSave(editor);
    }

    /**
     * Find and initialize all not-yet-attached description textareas.
     */
    function scan() {
        var textareas = document.querySelectorAll('textarea[name="description"]');
        for (var i = 0; i < textareas.length; i++) {
            attachEditor(textareas[i]);
        }
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
