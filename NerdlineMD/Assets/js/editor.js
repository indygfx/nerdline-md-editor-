/**
 * Nerdline MD Editor - glue code.
 *
 * Attaches EasyMDE to every task description textarea (name="description")
 * and adds a custom live preview overlay. Kanboard loads its edit modals
 * via AJAX, so a MutationObserver re-runs the attach logic for dynamically
 * injected forms. The editor content is mirrored back to the original
 * textarea on every change, so Kanboard's save logic stays untouched.
 */
(function () {
    'use strict';

    var ATTACHED_FLAG = 'data-nerdline-md-attached';
    var TOOLBAR_BUTTON_CLASS = 'nerdline-live-preview';

    /**
     * Escape HTML for the plain-text fallback renderer.
     * @param {string} text
     * @return {string}
     */
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    }

    /**
     * Render markdown using the editor's own rendering pipeline
     * (same engine and sanitization as EasyMDE's built-in preview).
     * @param {EasyMDE} editor
     * @param {string} text
     * @return {string} HTML
     */
    function renderMarkdown(editor, text) {
        if (editor && typeof editor.markdown === 'function') {
            return editor.markdown(text);
        }
        if (typeof marked === 'object' && marked && typeof marked.parse === 'function') {
            return marked.parse(text);
        }
        return '<p>' + escapeHtml(text).replace(/\n/g, '<br>') + '</p>';
    }

    /**
     * Find the form container the preview overlay should be measured in.
     * @param {HTMLTextAreaElement} textarea
     * @return {HTMLElement}
     */
    function findContainer(textarea) {
        var el = textarea;
        while (el && el !== document.body) {
            if (el.classList && el.classList.contains('task-form-container')) {
                return el;
            }
            el = el.parentNode;
        }
        return document.body;
    }

    /**
     * Measure the union of the secondary form columns. The preview
     * overlay is placed exactly over this area, reusing the space
     * Kanboard provides instead of resizing the form.
     * @param {HTMLElement} container
     * @return {?{left:number, top:number, width:number, height:number}}
     */
    function measureOverlayArea(container) {
        var columns = container.querySelectorAll('.task-form-secondary-column');
        if (!columns.length) {
            return null;
        }

        var containerRect = container.getBoundingClientRect();
        var left = Infinity;
        var top = Infinity;
        var right = -Infinity;
        var bottom = -Infinity;

        for (var i = 0; i < columns.length; i++) {
            var r = columns[i].getBoundingClientRect();
            if (r.width === 0 && r.height === 0) {
                continue;
            }
            left = Math.min(left, r.left);
            top = Math.min(top, r.top);
            right = Math.max(right, r.right);
            bottom = Math.max(bottom, r.bottom);
        }

        if (left === Infinity) {
            return null;
        }

        return {
            left: left - containerRect.left,
            top: top - containerRect.top,
            width: right - left,
            height: bottom - top
        };
    }

    /**
     * Position the preview panel over the measured area, with a
     * right-half fallback when no secondary columns exist.
     * @param {HTMLElement} panel
     * @param {HTMLElement} container
     * @param {HTMLElement} editorContainer
     */
    function positionPanel(panel, container, editorContainer) {
        var area = measureOverlayArea(container);

        if (area) {
            panel.style.left = area.left + 'px';
            panel.style.top = area.top + 'px';
            panel.style.width = area.width + 'px';
            panel.style.height = area.height + 'px';
            panel.style.maxHeight = 'none';
            return;
        }

        if (container === document.body) {
            panel.style.left = 'auto';
            panel.style.top = '20px';
            panel.style.right = '20px';
            panel.style.width = '45%';
            panel.style.height = 'auto';
            panel.style.maxHeight = '80vh';
            return;
        }

        var containerRect = container.getBoundingClientRect();
        var editorRect = editorContainer.getBoundingClientRect();
        panel.style.left = Math.round(containerRect.width / 2) + 'px';
        panel.style.top = (editorRect.top - containerRect.top) + 'px';
        panel.style.right = 'auto';
        panel.style.width = Math.round(containerRect.width / 2) + 'px';
        panel.style.height = 'auto';
        panel.style.maxHeight = Math.round(containerRect.height) + 'px';
    }

    /**
     * Create the live preview panel and wire it to the editor.
     * @param {EasyMDE} editor
     * @param {HTMLTextAreaElement} textarea
     * @return {Object} panel controller
     */
    function createPreviewPanel(editor, textarea) {
        var container = findContainer(textarea);
        var editorContainer = textarea.parentNode;

        var panel = document.createElement('div');
        panel.className = 'nerdline-md-preview';

        var header = document.createElement('div');
        header.className = 'nerdline-md-preview-header';

        var title = document.createElement('span');
        title.className = 'nerdline-md-preview-title';
        title.textContent = 'Live preview';

        var closeIcon = document.createElement('a');
        closeIcon.className = 'nerdline-md-preview-close';
        closeIcon.href = '#';
        closeIcon.innerHTML = '<i class="fa fa-times"></i>';

        header.appendChild(title);
        header.appendChild(closeIcon);

        var content = document.createElement('div');
        content.className = 'nerdline-md-preview-content markdown';

        panel.appendChild(header);
        panel.appendChild(content);

        container.appendChild(panel);

        var open = false;

        function refresh() {
            content.innerHTML = renderMarkdown(editor, editor.value());
        }

        function reposition() {
            positionPanel(panel, container, editorContainer);
        }

        function syncToolbarState() {
            var button = editorContainer.querySelector('.editor-toolbar .' + TOOLBAR_BUTTON_CLASS);
            if (button) {
                button.classList.toggle('active', open);
            }
        }

        function show() {
            reposition();
            refresh();
            panel.classList.add('is-open');
            open = true;
        }

        function hide() {
            panel.classList.remove('is-open');
            open = false;
        }

        function toggle() {
            if (open) {
                hide();
            } else {
                show();
            }
            syncToolbarState();
        }

        closeIcon.addEventListener('click', function (event) {
            event.preventDefault();
            hide();
            syncToolbarState();
        });

        window.addEventListener('resize', function () {
            if (open) {
                reposition();
            }
        });

        return {
            el: panel,
            toggle: toggle,
            refresh: refresh,
            isOpen: function () { return open; }
        };
    }

    /**
     * Create an EasyMDE instance plus the live preview overlay on the
     * given textarea.
     * @param {HTMLTextAreaElement} textarea
     */
    function attachEditor(textarea) {
        if (textarea.hasAttribute(ATTACHED_FLAG)) {
            return;
        }
        textarea.setAttribute(ATTACHED_FLAG, '1');

        var editor;
        var previewPanel = null;

        function togglePreview() {
            if (previewPanel) {
                previewPanel.toggle();
            }
        }

        editor = new EasyMDE({
            element: textarea,
            sideBySideFullscreen: false,
            spellChecker: false,
            status: false,
            autoDownloadFontAwesome: false,
            toolbar: [
                'bold', 'italic', 'heading', '|',
                'unordered-list', 'ordered-list', 'quote', '|',
                'link', 'image', 'code', 'table', '|',
                {
                    name: 'nerdline-live-preview',
                    className: TOOLBAR_BUTTON_CLASS,
                    title: 'Live preview (F10)',
                    action: function () {
                        togglePreview();
                    }
                },
                '|',
                'guide'
            ],
            shortcuts: {
                toggleSideBySide: null,
                togglePreview: null
            },
            extraKeys: {
                'F10': function () {
                    togglePreview();
                }
            }
        });

        previewPanel = createPreviewPanel(editor, textarea);

        // EasyMDE keeps the text in its CodeMirror instance and never
        // writes it back to the original textarea on its own. Kanboard
        // serializes the (hidden) textarea when saving the task, so the
        // value must be mirrored on every change - covers typing as well
        // as toolbar actions and AJAX-submitted modal forms. The same
        // handler keeps the live preview in sync.
        editor.codemirror.on('change', function () {
            textarea.value = editor.value();
            if (previewPanel.isOpen()) {
                previewPanel.refresh();
            }
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
