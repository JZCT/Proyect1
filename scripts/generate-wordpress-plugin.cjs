const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const distDir = path.resolve(__dirname, '..', 'dist', 'cecaptains');
const indexPath = path.join(distDir, 'index.html');
const wordpressDir = path.join(distDir, 'wordpress');
const pluginSlug = 'cecapta-embed';
const pluginDir = path.join(wordpressDir, pluginSlug);
const pluginAppDir = path.join(pluginDir, 'app');
const zipPath = path.join(wordpressDir, `${pluginSlug}.zip`);

function readIndexHtml() {
  if (!fs.existsSync(indexPath)) {
    throw new Error(`No se encontro ${indexPath}. Ejecuta primero el build de WordPress.`);
  }

  return fs.readFileSync(indexPath, 'utf8');
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeAssetPath(assetPath) {
  return assetPath.replace(/^\.?\//, '');
}

function extractValues(html, regex, groupIndex = 1) {
  return unique(
    [...html.matchAll(regex)]
      .map((match) => match[groupIndex]?.trim())
      .filter(Boolean)
  );
}

function ensureCleanDirectory(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

function copyFileIntoPlugin(relativePath) {
  const normalizedPath = normalizeAssetPath(relativePath);
  const sourcePath = path.join(distDir, normalizedPath);
  const targetPath = path.join(pluginAppDir, normalizedPath);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`No se encontro el asset ${sourcePath} dentro del build.`);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function copyDirectoryIntoPlugin(relativeDir) {
  const sourceDir = path.join(distDir, relativeDir);
  const targetDir = path.join(pluginAppDir, relativeDir);

  if (!fs.existsSync(sourceDir)) {
    return;
  }

  fs.cpSync(sourceDir, targetDir, { recursive: true });
}

function buildPluginPhp(criticalCss, stylesheetHrefs, scriptSrcs) {
  const normalizedStyles = stylesheetHrefs.map(normalizeAssetPath);
  const normalizedScripts = scriptSrcs.map(normalizeAssetPath);
  const moduleHandles = normalizedScripts.map((_, index) => `cecaptains-embed-module-${index + 1}`);

  const enqueueStylesPhp = normalizedStyles
    .map(
      (href, index) =>
        `  wp_enqueue_style('cecaptains-embed-style-${index + 1}', $cecapta_asset_base . '/${href}', array(), null);`
    )
    .join('\n');

  const enqueueScriptsPhp = normalizedScripts
    .map((src, index) => {
      const dependencyHandles = index === 0
        ? 'array()'
        : `array('${moduleHandles[index - 1]}')`;

      return `  wp_register_script('${moduleHandles[index]}', $cecapta_asset_base . '/${src}', ${dependencyHandles}, null, true);
  wp_enqueue_script('${moduleHandles[index]}');`;
    })
    .join('\n\n');

  const moduleHandlesPhp = moduleHandles
    .map((handle) => `    '${handle}'`)
    .join(",\n");

  const escapedCriticalCss = criticalCss
    .replace(/\\/g, '\\\\')
    .replace(/\$/g, '\\$');

  return `<?php
/**
 * Plugin Name: CecaptaINS Embed
 * Description: Inserta la app Angular CecaptaINS con el shortcode [cecapta_app].
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
  exit;
}

function cecaptains_embed_shortcode() {
  return '<div id="cecapta-wordpress-app"><app-root></app-root></div>';
}
add_shortcode('cecapta_app', 'cecaptains_embed_shortcode');

function cecaptains_embed_assets() {
  if (is_admin() || !is_singular()) {
    return;
  }

  global $post;
  if (!$post || !has_shortcode($post->post_content, 'cecapta_app')) {
    return;
  }

  $cecapta_asset_base = untrailingslashit(plugin_dir_url(__FILE__)) . '/app';

  wp_register_style('cecaptains-embed-critical', false, array(), null);
  wp_enqueue_style('cecaptains-embed-critical');
  wp_add_inline_style('cecaptains-embed-critical', <<<'CSS'
${escapedCriticalCss}
CSS);

${enqueueStylesPhp}

${enqueueScriptsPhp}

  wp_add_inline_script('${moduleHandles[0]}', "window.CECAPTA_EMBED_MODE = 'wordpress';\\nwindow.CECAPTA_ASSET_BASE_URL = '" . esc_js($cecapta_asset_base) . "';", 'before');
}
add_action('wp_enqueue_scripts', 'cecaptains_embed_assets');

function cecaptains_embed_script_loader_tag($tag, $handle, $src) {
  $module_handles = array(
${moduleHandlesPhp}
  );

  if (in_array($handle, $module_handles, true)) {
    return '<script type="module" src="' . esc_url($src) . '"></script>';
  }

  return $tag;
}
add_filter('script_loader_tag', 'cecaptains_embed_script_loader_tag', 10, 3);
`;
}

function buildPluginReadme(stylesheetHrefs, scriptSrcs) {
  return `CecaptaINS Embed Plugin
======================

Instalacion:
1. Sube este ZIP desde Plugins > Anadir nuevo > Subir plugin.
2. Activalo.
3. Inserta el shortcode [cecapta_app] en la pagina deseada.

Assets incluidos:
- CSS: ${stylesheetHrefs.map(normalizeAssetPath).join(', ')}
- JS: ${scriptSrcs.map(normalizeAssetPath).join(', ')}
`;
}

function escapePowerShellPath(value) {
  return value.replace(/'/g, "''");
}

function zipDirectory(sourceDir, destinationZip) {
  fs.rmSync(destinationZip, { force: true });

  if (process.platform === 'win32') {
    const command = `Compress-Archive -Path '${escapePowerShellPath(sourceDir)}' -DestinationPath '${escapePowerShellPath(destinationZip)}' -Force`;
    const result = spawnSync('powershell', ['-NoProfile', '-Command', command], { stdio: 'inherit' });

    if (result.status !== 0) {
      throw new Error('No se pudo generar el ZIP del plugin con PowerShell.');
    }

    return;
  }

  const result = spawnSync('zip', ['-r', destinationZip, path.basename(sourceDir)], {
    cwd: path.dirname(sourceDir),
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error('No se pudo generar el ZIP del plugin. Instala zip o genera el archivo manualmente.');
  }
}

function main() {
  const html = readIndexHtml();
  const criticalCss = extractValues(html, /<style[^>]*>([\s\S]*?)<\/style>/gi).join('\n\n');
  const stylesheetHrefs = extractValues(html, /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/gi);
  const scriptSrcs = extractValues(html, /<script[^>]+src="([^"]+)"[^>]*type="module"[^>]*><\/script>/gi);

  if (stylesheetHrefs.length === 0 || scriptSrcs.length === 0) {
    throw new Error('No se pudieron detectar los assets del build en dist/cecaptains/index.html');
  }

  ensureCleanDirectory(pluginDir);
  ensureCleanDirectory(pluginAppDir);

  stylesheetHrefs.forEach(copyFileIntoPlugin);
  scriptSrcs.forEach(copyFileIntoPlugin);
  copyDirectoryIntoPlugin('assets');

  fs.writeFileSync(path.join(pluginDir, `${pluginSlug}.php`), buildPluginPhp(criticalCss, stylesheetHrefs, scriptSrcs));
  fs.writeFileSync(path.join(pluginDir, 'README.txt'), buildPluginReadme(stylesheetHrefs, scriptSrcs));

  zipDirectory(pluginDir, zipPath);

  console.log(`Plugin WordPress generado en ${pluginDir}`);
  console.log(`ZIP listo para instalar en ${zipPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
