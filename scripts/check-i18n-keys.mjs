import fs from 'node:fs';
import path from 'node:path';

const LOCALES_DIR = path.join(process.cwd(), 'lib', 'i18n', 'locales');
const SOURCE_LOCALE = 'en-US.json';

// ── CLI flags ────────────────────────────────────────────────────────────────
//   --strict   Exit non-zero when untranslated values are found. Without this
//              flag, untranslated values are reported as warnings but the
//              script still exits 0 (transition mode, so existing untranslated
//              content does not block CI while localisation catches up).
const STRICT = process.argv.includes('--strict');

// ── Helpers ──────────────────────────────────────────────────────────────────

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function formatPath(keyPath) {
  return keyPath || '<root>';
}

/**
 * Flatten a nested locale object into a `keyPath -> leafValue` map.
 * Throws on arrays / empty objects / non-object roots, which are structural
 * mistakes that would silently break i18next lookups.
 */
function collectLeafEntries(value, fileName, keyPath = '', out = new Map()) {
  if (Array.isArray(value)) {
    throw new Error(
      `${fileName} has an array at "${formatPath(keyPath)}". Locale values must not be arrays.`,
    );
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      throw new Error(
        `${fileName} has an empty object at "${formatPath(keyPath)}". Locale objects must not be empty.`,
      );
    }

    for (const [key, child] of entries) {
      const nextPath = keyPath ? `${keyPath}.${key}` : key;
      collectLeafEntries(child, fileName, nextPath, out);
    }

    return out;
  }

  if (!keyPath) {
    throw new Error(`${fileName} must contain a JSON object at the root.`);
  }

  out.set(keyPath, value);
  return out;
}

function readLocaleEntries(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const fileName = path.basename(filePath);

  if (!isPlainObject(parsed)) {
    throw new Error(`${fileName} must contain a JSON object at the root.`);
  }

  return collectLeafEntries(parsed, fileName);
}

// ── "Legitimately identical" classification ─────────────────────────────────
// A non-source value that equals the source value is *usually* untranslated,
// but some values are intentionally identical across locales. The predicates
// below identify those cases so we do not report false positives.

/** Value is only i18next interpolation, e.g. "{{count}}" or "{{n}} / {{total}}". */
function isPureInterpolation(value) {
  return (
    typeof value === 'string' &&
    /^{{[^}]+}}(\s*\/\s*{{[^}]+}})*$/.test(value.trim()) &&
    !value.includes('{{/') // leave structural-markup-style strings to translation
  );
}

/** Value is a URL or URL placeholder. */
function isUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

/**
 * Key/value is a brand name, provider name, language native name, or other
 * technical token that is conventionally left untranslated.
 */
function isBrandOrTechnicalToken(key, value) {
  if (typeof value !== 'string' || typeof key !== 'string') return false;

  // Language picker entries are stored in the native language on purpose:
  //   settings.lang_zh = "中文", settings.lang_en = "English", ...
  if (/^settings\.lang_/.test(key)) return true;

  // Provider / model / TTS option labels are product proper nouns:
  //   settings.providerNames.openai = "OpenAI"
  //   settings.providerTypes.azure = "Azure OpenAI"
  //   settings.ttsModelOptions.openaiTts = "OpenAI TTS"
  //   settings.providerOpenAITTS, settings.providerAzureTTS, settings.providerMinerU ...
  if (
    /^settings\.(providerNames|providerTypes|ttsModelOptions)\./.test(key) ||
    /^settings\.provider[A-Z]/.test(key)
  ) {
    return true;
  }

  // Standalone brand / acronym / universal technical tokens that never get
  // translated. "AccessKey ID" / "AccessKey Secret" are kept verbatim per
  // Aliyun's own localised docs; "3D" is a universal visualisation label.
  const brandTokens = new Set([
    'MCP',
    'OpenAI',
    'Azure',
    'Azure OpenAI',
    'Azure TTS',
    'Azure STT',
    'Claude',
    'Gemini',
    'DeepSeek',
    'Kimi',
    'MiniMax',
    'GLM',
    'OpenRouter',
    'Grok',
    'Tavily',
    'Brave Search',
    'SearXNG',
    'VoxCPM2',
    'ElevenLabs',
    'MinerU',
    'PBL',
    'Nova',
    'OpenAI TTS',
    'MiniMax TTS',
    'GLM TTS',
    'ElevenLabs TTS',
    '3D',
    'AccessKey ID',
    'AccessKey Secret',
  ]);
  if (brandTokens.has(value)) return true;

  return false;
}

function isLegitimatelyIdentical(key, value) {
  return (
    isPureInterpolation(value) ||
    isUrl(value) ||
    isBrandOrTechnicalToken(key, value)
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const localeFiles = fs
    .readdirSync(LOCALES_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();

  if (!localeFiles.includes(SOURCE_LOCALE)) {
    throw new Error(`Missing source locale: ${SOURCE_LOCALE}`);
  }

  const sourceEntries = readLocaleEntries(path.join(LOCALES_DIR, SOURCE_LOCALE));
  const sourceKeys = new Set(sourceEntries.keys());

  const keyReports = []; // structural (missing/extra) key-misalignment reports
  const untranslatedReports = []; // per-locale untranslated-value reports

  for (const localeFile of localeFiles) {
    if (localeFile === SOURCE_LOCALE) continue;

    const localeEntries = readLocaleEntries(path.join(LOCALES_DIR, localeFile));
    const localeKeys = new Set(localeEntries.keys());

    const missing = [...sourceKeys].filter((key) => !localeKeys.has(key)).sort();
    const extra = [...localeKeys].filter((key) => !sourceKeys.has(key)).sort();

    if (missing.length > 0 || extra.length > 0) {
      keyReports.push({ file: localeFile, missing, extra });
    }

    // Untranslated-value detection: a non-source value that is byte-identical
    // to the source value AND is not a legitimately-identical token.
    const untranslated = [];
    for (const [key, sourceValue] of sourceEntries) {
      const localeValue = localeEntries.get(key);
      if (localeValue === sourceValue && !isLegitimatelyIdentical(key, sourceValue)) {
        untranslated.push(key);
      }
    }

    if (untranslated.length > 0) {
      untranslated.sort();
      untranslatedReports.push({ file: localeFile, count: untranslated.length, keys: untranslated });
    }
  }

  // ── Report: key alignment ───────────────────────────────────────────────
  if (keyReports.length === 0) {
    console.log(
      `i18n key alignment check passed (${localeFiles.length} locale files, source: ${SOURCE_LOCALE}).`,
    );
  } else {
    console.error(`i18n key alignment check failed against ${SOURCE_LOCALE}:`);
    for (const report of keyReports) {
      console.error(`\n- ${report.file}`);
      if (report.missing.length > 0) {
        console.error(`  Missing keys (${report.missing.length}):`);
        for (const key of report.missing) console.error(`    - ${key}`);
      }
      if (report.extra.length > 0) {
        console.error(`  Extra keys (${report.extra.length}):`);
        for (const key of report.extra) console.error(`    - ${key}`);
      }
    }
  }

  // ── Report: untranslated values ─────────────────────────────────────────
  if (untranslatedReports.length > 0) {
    const total = untranslatedReports.reduce((sum, r) => sum + r.count, 0);
    const level = STRICT ? 'error' : 'warn';
    const logger = STRICT ? console.error : console.warn;
    logger(
      `[${level}] i18n untranslated-value check found ${total} value(s) identical to ${SOURCE_LOCALE} across ${untranslatedReports.length} locale(s):`,
    );
    for (const report of untranslatedReports) {
      logger(`\n- ${report.file} (${report.count} untranslated):`);
      // Cap per-locale output to keep logs actionable; full lists can be
      // regenerated by running the script locally.
      const shown = report.keys.slice(0, 50);
      for (const key of shown) logger(`    - ${key}`);
      if (report.keys.length > shown.length) {
        logger(`    ... and ${report.keys.length - shown.length} more (run locally for full list).`);
      }
    }
    if (!STRICT) {
      console.warn(
        '[i18n] untranslated values are reported as warnings. Run with --strict to fail CI once localisation is complete.',
      );
    }
  } else {
    console.log('i18n untranslated-value check passed (no suspect identical values).');
  }

  if (keyReports.length > 0) process.exit(1);
  if (STRICT && untranslatedReports.length > 0) process.exit(1);
}

main();
