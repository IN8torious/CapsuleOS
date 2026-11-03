'use strict';

// Model-free static report. Works only on names, sizes and bounded UTF-8 text
// already read by mod-package.cjs. Nothing here executes or extracts anything.

const SIGNAL_RULES = [
  { id: 'process-exec', level: 'high', label: 'Starts other programs', test: /\b(Runtime\.getRuntime\(\)\.exec|ProcessBuilder|child_process|subprocess|os\.system|Start-Process|Invoke-Expression|\bexec\()/ },
  { id: 'network', level: 'medium', label: 'Makes network requests', test: /\b(HttpURLConnection|HttpClient|java\.net\.URL|new URL\(|fetch\(|XMLHttpRequest|WebSocket|requests\.(get|post)|urllib|curl |Invoke-WebRequest)/ },
  { id: 'dynamic-code', level: 'high', label: 'Evaluates or loads code at run time', test: /\b(eval\(|new Function\(|ClassLoader|URLClassLoader|defineClass|Class\.forName|loadstring|dofile|require\(\s*[^'"\s)])/ },
  { id: 'file-delete', level: 'medium', label: 'Deletes or rewrites files', test: /\b(Files\.delete|\.delete\(\)|fs\.(unlink|rm|rmdir)|os\.remove|shutil\.rmtree|Remove-Item)/ },
  { id: 'registry', level: 'high', label: 'Touches the Windows registry', test: /\b(reg add|reg delete|HKEY_|Set-ItemProperty|RegSetValue)/i },
  { id: 'obfuscation', level: 'medium', label: 'Decodes hidden text', test: /\b(atob\(|Base64\.getDecoder|base64\.b64decode|FromBase64String)/ },
  { id: 'credentials', level: 'high', label: 'Mentions tokens or passwords', test: /\b(access[_-]?token|session[_-]?id|password|discord[_-]?token|\.minecraft[\\/]launcher_profiles)/i }
];

const ASSET_CATEGORIES = [
  ['textures', /(^|\/)assets\/[^/]+\/textures\//i],
  ['models', /(^|\/)assets\/[^/]+\/(models|geo|animations)\//i],
  ['sounds', /(^|\/)assets\/[^/]+\/sounds?\//i],
  ['languages', /(^|\/)assets\/[^/]+\/lang\//i],
  ['shaders', /(^|\/)assets\/[^/]+\/shaders?\//i],
  ['recipes', /(^|\/)data\/[^/]+\/recipes?\//i],
  ['loot tables', /(^|\/)data\/[^/]+\/loot_tables?\//i],
  ['worldgen', /(^|\/)data\/[^/]+\/(worldgen|dimension|structures?)\//i],
  ['tags & advancements', /(^|\/)data\/[^/]+\/(tags|advancements?)\//i],
  ['mixins', /\.mixins?\.json$/i],
  ['native libraries', /\.(dll|so|dylib)$/i],
  ['nested jars', /\.jar$/i],
  ['compiled classes', /\.class$/i]
];

function safeJson(text) {
  try { return JSON.parse(text.replace(/^\uFEFF/, '')); } catch { return null; }
}

function clip(value, max = 200) {
  return typeof value === 'string' ? value.slice(0, max) : undefined;
}

function tomlValue(text, key) {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*"([^"\\n]{1,200})"`, 'm').exec(text);
  return match ? match[1] : undefined;
}

function authorList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? item : item?.name)).filter(Boolean).map((v) => clip(String(v), 80)).slice(0, 10);
  }
  return typeof value === 'string' ? [clip(value, 80)] : [];
}

function parseMetadata(documents) {
  const find = (re) => documents.find((doc) => re.test(doc.path.replace(/\\/g, '/').split('/').pop().toLowerCase()));
  const meta = { loader: 'unknown', id: undefined, name: undefined, version: undefined, description: undefined, authors: [], license: undefined, dependencies: [], minecraft: undefined, sourceFile: undefined };

  const fabric = find(/^fabric\.mod\.json$/) || find(/^quilt\.mod\.json$/);
  const forge = find(/^(neoforge\.)?mods\.toml$/);
  const legacy = find(/^mcmod\.info$/);
  const modrinth = find(/^modrinth\.index\.json$/);
  const pack = find(/^pack\.mcmeta$/);
  const manifest = find(/^manifest\.json$/);

  if (fabric) {
    const json = safeJson(fabric.text) || {};
    const quilt = /quilt/i.test(fabric.path);
    const body = quilt ? json.quilt_loader || {} : json;
    const info = quilt ? body.metadata || {} : body;
    meta.loader = quilt ? 'Quilt' : 'Fabric';
    meta.id = clip(quilt ? body.id : json.id, 80);
    meta.version = clip(quilt ? body.version : json.version, 60);
    meta.name = clip(info.name, 100);
    meta.description = clip(info.description, 300);
    meta.authors = authorList(quilt ? Object.keys(info.contributors || {}) : json.authors);
    meta.license = clip(Array.isArray(info.license) ? info.license.join(', ') : info.license, 100);
    const deps = quilt ? (body.depends || []).map((d) => (typeof d === 'string' ? d : d.id)) : Object.keys(json.depends || {});
    meta.dependencies = deps.filter(Boolean).map((d) => clip(String(d), 60)).slice(0, 30);
    const mc = quilt ? undefined : json.depends?.minecraft;
    meta.minecraft = clip(Array.isArray(mc) ? mc.join(' | ') : mc, 60);
    meta.sourceFile = fabric.path;
  } else if (forge) {
    meta.loader = /neoforge/i.test(forge.path) ? 'NeoForge' : 'Forge';
    meta.id = tomlValue(forge.text, 'modId');
    meta.name = tomlValue(forge.text, 'displayName');
    meta.version = tomlValue(forge.text, 'version');
    meta.authors = authorList(tomlValue(forge.text, 'authors'));
    meta.license = tomlValue(forge.text, 'license');
    meta.description = clip((/description\s*=\s*'''([\s\S]{0,400}?)'''/.exec(forge.text) || [])[1]?.trim(), 300);
    meta.dependencies = [...forge.text.matchAll(/dependencies\.[^\]]*\][\s\S]*?modId\s*=\s*"([^"]+)"/g)].map((m) => m[1]).slice(0, 30);
    meta.sourceFile = forge.path;
  } else if (legacy) {
    const json = safeJson(legacy.text);
    const entry = Array.isArray(json) ? json[0] : json?.modList?.[0];
    meta.loader = 'Forge (legacy)';
    meta.id = clip(entry?.modid, 80);
    meta.name = clip(entry?.name, 100);
    meta.version = clip(entry?.version, 60);
    meta.description = clip(entry?.description, 300);
    meta.authors = authorList(entry?.authorList);
    meta.sourceFile = legacy.path;
  } else if (modrinth) {
    const json = safeJson(modrinth.text) || {};
    meta.loader = 'Modrinth modpack';
    meta.name = clip(json.name, 100);
    meta.version = clip(json.versionId, 60);
    meta.description = clip(json.summary, 300);
    meta.dependencies = Object.entries(json.dependencies || {}).map(([k, v]) => `${k} ${v}`).slice(0, 30);
    meta.minecraft = clip(json.dependencies?.minecraft, 40);
    meta.sourceFile = modrinth.path;
  } else if (manifest) {
    const json = safeJson(manifest.text) || {};
    const header = json.header || json;
    meta.loader = json.format_version ? 'Bedrock pack' : 'Manifest';
    meta.name = clip(header.name, 100);
    meta.version = clip(Array.isArray(header.version) ? header.version.join('.') : header.version, 40);
    meta.description = clip(header.description, 300);
    meta.id = clip(header.uuid, 60);
    meta.dependencies = (json.dependencies || []).map((d) => clip(String(d.uuid || d.module_name || ''), 60)).filter(Boolean).slice(0, 30);
    meta.sourceFile = manifest.path;
  } else if (pack) {
    const json = safeJson(pack.text)?.pack || {};
    meta.loader = 'Resource/data pack';
    meta.description = clip(typeof json.description === 'string' ? json.description : JSON.stringify(json.description || ''), 300);
    meta.version = json.pack_format !== undefined ? `pack_format ${json.pack_format}` : undefined;
    meta.sourceFile = pack.path;
  }

  if (!meta.license) {
    const licenseDoc = documents.find((doc) => /^(license|licence)(\.|$)/i.test(doc.path.split('/').pop()));
    if (licenseDoc) {
      const head = licenseDoc.text.slice(0, 600);
      meta.license = /MIT License/i.test(head) ? 'MIT'
        : /Apache License/i.test(head) ? 'Apache-2.0'
          : /GNU (Lesser )?General Public/i.test(head) ? 'GPL/LGPL family'
            : /All rights reserved/i.test(head) ? 'All rights reserved'
              : 'License file present (not recognised)';
    }
  }
  return meta;
}

function inventory(entryNames) {
  const counts = new Map();
  for (const name of entryNames) {
    const normalized = name.replace(/\\/g, '/');
    for (const [category, pattern] of ASSET_CATEGORIES) {
      if (pattern.test(normalized)) counts.set(category, (counts.get(category) || 0) + 1);
    }
  }
  return [...counts.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
}

function scanSignals(sources) {
  const found = [];
  for (const rule of SIGNAL_RULES) {
    const hits = [];
    for (const source of sources) {
      const lines = source.text.split(/\r\n|\n|\r/);
      for (let i = 0; i < lines.length && hits.length < 3; i += 1) {
        if (rule.test.test(lines[i])) hits.push({ path: source.path, line: i + 1, excerpt: lines[i].trim().slice(0, 120) });
      }
    }
    if (hits.length) found.push({ id: rule.id, level: rule.level, label: rule.label, hits });
  }
  return found;
}

function structuralNotes(entryNames, executablePaths) {
  const notes = [];
  const natives = entryNames.filter((n) => /\.(dll|so|dylib|exe)$/i.test(n));
  if (natives.length) notes.push({ level: 'high', text: `${natives.length} native binary file(s) (e.g. ${natives[0]}). These cannot be read here and run outside the game sandbox if loaded.` });
  const nested = entryNames.filter((n) => /\.jar$/i.test(n));
  if (nested.length) notes.push({ level: 'medium', text: `${nested.length} nested jar(s) bundled inside. Each is a separate package to review.` });
  if (executablePaths.length) notes.push({ level: 'info', text: `${executablePaths.length}${executablePaths.length >= 20 ? '+' : ''} compiled entries were not read. A decompiler-level review is outside this tool.` });
  const odd = entryNames.filter((n) => /\.(bat|cmd|ps1|sh|vbs|scr)$/i.test(n));
  if (odd.length) notes.push({ level: 'high', text: `Script file(s) shipped in the package: ${odd.slice(0, 3).join(', ')}.` });
  return notes;
}

function verdict(signals, notes, meta) {
  const high = signals.filter((s) => s.level === 'high').length + notes.filter((n) => n.level === 'high').length;
  const medium = signals.filter((s) => s.level === 'medium').length + notes.filter((n) => n.level === 'medium').length;
  const level = high ? 'review-carefully' : medium ? 'check-details' : 'no-flags';
  const summary = {
    'review-carefully': 'Contains capabilities that deserve a careful look before you trust it.',
    'check-details': 'A few common capabilities were found. Usually fine, but check they match the mod’s purpose.',
    'no-flags': 'No flagged capabilities in the readable text. This is not a guarantee: compiled code was not read.'
  }[level];
  return { level, summary, metadataFound: meta.loader !== 'unknown' };
}

function buildStaticReport({ entryNames, documents, sources, executablePaths }) {
  const meta = parseMetadata(documents);
  const signals = scanSignals(sources);
  const notes = structuralNotes(entryNames, executablePaths);
  return {
    metadata: meta,
    inventory: inventory(entryNames),
    signals,
    notes,
    verdict: verdict(signals, notes, meta)
  };
}

function reportToMarkdown(name, sha256, report) {
  const m = report.metadata;
  const lines = [
    `# Static review: ${m.name || name}`,
    '',
    `- File: ${name}`,
    `- SHA-256: \`${sha256}\``,
    `- Type: ${m.loader}${m.sourceFile ? ` (from \`${m.sourceFile}\`)` : ''}`,
    `- Id / version: ${m.id || 'unknown'} / ${m.version || 'unknown'}`,
    `- Minecraft: ${m.minecraft || 'unknown'}`,
    `- Authors: ${m.authors.length ? m.authors.join(', ') : 'unknown'}`,
    `- License: ${m.license || 'unknown'}`,
    '',
    `**Verdict:** ${report.verdict.summary}`,
    ''
  ];
  if (m.description) lines.push(m.description, '');
  if (m.dependencies.length) lines.push('## Dependencies', ...m.dependencies.map((d) => `- ${d}`), '');
  if (report.inventory.length) lines.push('## Contents', ...report.inventory.map((i) => `- ${i.category}: ${i.count}`), '');
  if (report.signals.length || report.notes.length) {
    lines.push('## Flags');
    for (const s of report.signals) {
      lines.push(`- [${s.level}] ${s.label}`, ...s.hits.map((h) => `  - \`${h.path}:${h.line}\` ${h.excerpt}`));
    }
    for (const n of report.notes) lines.push(`- [${n.level}] ${n.text}`);
    lines.push('');
  }
  lines.push('_Generated locally by Mod Forge. Nothing was extracted or run. Flags are pattern matches, not proof._');
  return lines.join('\n');
}

module.exports = { buildStaticReport, reportToMarkdown, parseMetadata, inventory, scanSignals };
