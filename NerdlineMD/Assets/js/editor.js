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
                'bold', 'italic', 'heading', '|',
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

        // save new Content back to the original textarea on every change, so Kanboard's
        // save logic works without any modifications. This is done below, because
        // EasyMDE's onChange callback is not called for toolbar actions.   
        editor.codemirror.on('change', function () {
            textarea.value = editor.value();
        });

        // EasyMDE keeps the text in its CodeMirror instance and never
        // writes it back to the original textarea on its own. Kanboard
        // serializes the (hidden) textarea when saving the task, so the
        // value must be mirrored on every change - covers typing as well
        // as toolbar actions, and AJAX-submitted modal forms.
        editor.codemirror.on('change', function () {
            textarea.value = editor.value();
        });
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
})();
