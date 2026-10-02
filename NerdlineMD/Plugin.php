<?php

namespace Kanboard\Plugin\NerdlineMD;

use Kanboard\Core\Plugin\Base;

/**
 * Nerdline MD Editor
 *
 * Provides a local EasyMDE markdown editor with side-by-side preview
 * for task description fields. All assets are served from the plugin
 * directory - no external requests, texts never leave the server.
 */
class Plugin extends Base
{
    public function initialize()
    {
        // Vendor stylesheet (EasyMDE, includes CodeMirror styling)
        $this->hook->on('template:layout:css', array(
            'template' => 'plugins/NerdlineMD/Assets/css/easymde.min.css',
        ));

        // Plugin-specific tweaks (fit into Kanboard layout/modals)
        $this->hook->on('template:layout:css', array(
            'template' => 'plugins/NerdlineMD/Assets/css/editor.css',
        ));

        // EasyMDE bundle (editor + CodeMirror + marked, all bundled locally)
        $this->hook->on('template:layout:js', array(
            'template' => 'plugins/NerdlineMD/Assets/js/easymde.min.js',
        ));

        // Our glue code: attaches the editor to task description textareas
        $this->hook->on('template:layout:js', array(
            'template' => 'plugins/NerdlineMD/Assets/js/editor.js',
        ));
    }

    public function getPluginName()
    {
        return 'Nerdline MD Editor';
    }

    public function getPluginDescription()
    {
        return 'Local Markdown editor with parallel preview for task descriptions';
    }

    public function getPluginAuthor()
    {
        return 'indy - nerdline media solution';
    }

    public function getPluginVersion()
    {
        return '0.0.1';
    }

    public function getPluginHomepage()
    {
        return 'https://www.nerdline.de';
    }

    public function getCompatibleVersion()
    {
        return '>=1.2.33';
    }
}
