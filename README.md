# Nerdline MD Editor (Kanboard Plugin)

Local-only Markdown editor (EasyMDE, side-by-side preview) for task descriptions in Kanboard.
No external requests, no external iframes, no database changes.

## Design decisions

- **Editor:** EasyMDE, fully vendored inside the plugin → texts never leave the server
- **Scope:** textareas `name="description"` (task create + task edit modal), nothing else
- **Integration:** pure JS attach via hooks — 0 template overrides, 0 DB changes
- **Compatibility:** Kanboard ≥ 1.2.33 (local assets are CSP-safe: `script-src 'self'`)

## File structure

```
NerdlineMD/
├── Plugin.php
└── Assets/
    ├── css/
    │   ├── easymde.min.css      (vendor, EasyMDE 2.18.0)
    │   └── editor.css           (ours)
    └── js/
        ├── easymde.min.js       (vendor, EasyMDE 2.18.0)
        └── editor.js            (ours)
```

The minified bundle contains the editor, CodeMirror and the markdown renderer — nothing else is loaded. The spell checker is disabled and Font Awesome auto-download is turned off, so the editor makes zero requests to external hosts. Toolbar icons rely on the Font Awesome copy that Kanboard already ships locally.

## Installation

1. Copy the `NerdlineMD/` folder to `plugins/NerdlineMD/` on your Kanboard server.
2. Ensure file permissions match your webserver user.
3. Done — no settings page, no activation step; the hook runs automatically.

## Verification checklist

- [ ] Task create form: description textarea shows toolbar + side-by-side preview (F9)
- [ ] Task edit modal ("Edit description"): editor attaches after AJAX load
- [ ] Save: content written back to textarea arrives in Kanboard unchanged
- [ ] Network tab: zero requests to external hosts while editing

## Vendor assets

The vendored files originate from the [EasyMDE](https://github.com/Ionaru/easy-markdown-editor) npm package `easymde@2.18.0` (MIT License). They are checked in so the plugin is fully self-contained.

## Open / next steps

- Comment textareas (decided against for v0.0.1)
- Config toggle per project or user (currently always-on for descriptions)
