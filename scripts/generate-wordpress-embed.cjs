const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist', 'cecaptains');
const indexPath = path.join(distDir, 'index.html');
const outputDir = path.join(distDir, 'wordpress');
const assetBasePlaceholder = 'https://tu-dominio.com/wp-content/uploads/cecaptains';

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

function buildHtmlSnippet(criticalCss, stylesheetHrefs, scriptSrcs) {
  const stylesheetTags = stylesheetHrefs
    .map((href) => `<link rel="stylesheet" href="${assetBasePlaceholder}/${normalizeAssetPath(href)}">`)
    .join('\n');

  const scriptTags = scriptSrcs
    .map((src) => `<script type="module" src="${assetBasePlaceholder}/${normalizeAssetPath(src)}"></script>`)
    .join('\n');

  return `<!-- CecaptaINS: snippet para incrustar en una pagina de WordPress -->
<!-- Reemplaza TODAS las apariciones de ${assetBasePlaceholder} por la URL real donde subas dist/cecaptains -->
<script>
window.CECAPTA_EMBED_MODE = 'wordpress';
window.CECAPTA_ASSET_BASE_URL = '${assetBasePlaceholder}';
</script>
${criticalCss ? `<style>\n${criticalCss}\n</style>` : ''}
${stylesheetTags}
<div id="cecapta-wordpress-app">
  <app-root></app-root>
</div>
${scriptTags}
`;
}

function buildPhpSnippet(criticalCss, stylesheetHrefs, scriptSrcs) {
  const normalizedStyles = stylesheetHrefs.map(normalizeAssetPath);
  const normalizedScripts = scriptSrcs.map(normalizeAssetPath);
  const moduleHandles = normalizedScripts.map((_, index) => `cecapta-app-module-${index + 1}`);

  const enqueueStylesPhp = normalizedStyles
    .map(
      (href, index) =>
        `  wp_enqueue_style('cecapta-app-style-${index + 1}', $cecapta_asset_base . '/${href}', array(), null);`
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
 * CecaptaINS WordPress embed helper.
 *
 * 1. Sube el contenido de dist/cecaptains a wp-content/uploads/cecaptains
 * 2. Copia este archivo dentro de tu tema hijo o plugin personalizado
 * 3. Cargalo desde functions.php o incluyelo en tu plugin
 * 4. Usa el shortcode [cecapta_app] dentro de la pagina
 */

function cecapta_app_shortcode() {
  return '<div id="cecapta-wordpress-app"><app-root></app-root></div>';
}
add_shortcode('cecapta_app', 'cecapta_app_shortcode');

function cecapta_app_embed_assets() {
  if (!is_singular()) {
    return;
  }

  global $post;
  if (!$post || !has_shortcode($post->post_content, 'cecapta_app')) {
    return;
  }

  $cecapta_asset_base = content_url('uploads/cecaptains');

  wp_register_style('cecapta-app-critical', false, array(), null);
  wp_enqueue_style('cecapta-app-critical');
  wp_add_inline_style('cecapta-app-critical', <<<'CSS'
${escapedCriticalCss}
CSS);

${enqueueStylesPhp}

${enqueueScriptsPhp}

  wp_add_inline_script('${moduleHandles[0]}', "window.CECAPTA_EMBED_MODE = 'wordpress';\\nwindow.CECAPTA_ASSET_BASE_URL = '" . esc_js($cecapta_asset_base) . "';", 'before');
}
add_action('wp_enqueue_scripts', 'cecapta_app_embed_assets');

function cecapta_app_embed_script_loader_tag($tag, $handle, $src) {
  $module_handles = array(
${moduleHandlesPhp}
  );

  if (in_array($handle, $module_handles, true)) {
    return '<script type="module" src="' . esc_url($src) . '"></script>';
  }

  return $tag;
}
add_filter('script_loader_tag', 'cecapta_app_embed_script_loader_tag', 10, 3);
`;
}

function buildReadme(stylesheetHrefs, scriptSrcs) {
  return `CecaptaINS WordPress embed
===========================

Archivos generados:
- cecapta-page-snippet.html
- cecapta-shortcode.php

Ruta sugerida en WordPress:
- wp-content/uploads/cecaptains

Pasos recomendados:
1. Ejecuta npm run build:wordpress:embed
2. Sube todo dist/cecaptains a wp-content/uploads/cecaptains
3. Usa una de estas opciones:
   - Pegar cecapta-page-snippet.html en un bloque Custom HTML
   - Copiar cecapta-shortcode.php a un plugin o tema hijo y usar [cecapta_app]

Assets detectados:
- CSS: ${stylesheetHrefs.map(normalizeAssetPath).join(', ')}
- JS: ${scriptSrcs.map(normalizeAssetPath).join(', ')}
`;
}

function main() {
  const html = readIndexHtml();
  const criticalCss = extractValues(html, /<style[^>]*>([\s\S]*?)<\/style>/gi).join('\n\n');
  const stylesheetHrefs = extractValues(html, /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/gi);
  const scriptSrcs = extractValues(html, /<script[^>]+src="([^"]+)"[^>]*type="module"[^>]*><\/script>/gi);

  if (stylesheetHrefs.length === 0 || scriptSrcs.length === 0) {
    throw new Error('No se pudieron detectar los assets del build en dist/cecaptains/index.html');
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'cecapta-page-snippet.html'), buildHtmlSnippet(criticalCss, stylesheetHrefs, scriptSrcs));
  fs.writeFileSync(path.join(outputDir, 'cecapta-shortcode.php'), buildPhpSnippet(criticalCss, stylesheetHrefs, scriptSrcs));
  fs.writeFileSync(path.join(outputDir, 'README.txt'), buildReadme(stylesheetHrefs, scriptSrcs));

  console.log(`Archivos WordPress generados en ${outputDir}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
