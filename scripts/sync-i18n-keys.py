#!/usr/bin/env python3
"""Sync i18n locale files with en-US.json.

Adds missing keys (using the English value as fallback) and removes
extra keys so that all locale files match en-US.json's key structure.
The output is sorted with 2-space indentation to match prettier.
"""
import json
import os
import sys

LOCALES_DIR = os.path.join(os.path.dirname(__file__), '..', 'lib', 'i18n', 'locales')
SOURCE = 'en-US.json'


def get_flat_keys(obj, prefix=''):
    """Return {dotted.key: value} for all leaf keys."""
    keys = {}
    for k, v in obj.items():
        path = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            keys.update(get_flat_keys(v, path))
        else:
            keys[path] = v
    return keys


def set_nested(obj, dotted_key, value):
    """Set a value at a dotted path, creating intermediate objects."""
    parts = dotted_key.split('.')
    for p in parts[:-1]:
        if p not in obj or not isinstance(obj[p], dict):
            obj[p] = {}
        obj = obj[p]
    obj[parts[-1]] = value


def main():
    locales = LOCALES_DIR
    with open(os.path.join(locales, SOURCE)) as f:
        en_flat = get_flat_keys(json.load(f))

    for fname in sorted(os.listdir(locales)):
        if not fname.endswith('.json') or fname == SOURCE:
            continue

        fpath = os.path.join(locales, fname)
        with open(fpath) as f:
            loc_obj = json.load(f)
        loc_flat = get_flat_keys(loc_obj)

        missing = set(en_flat) - set(loc_flat)
        extra = set(loc_flat) - set(en_flat)

        if not missing and not extra:
            print(f"{fname}: OK")
            continue

        # Add missing keys with English fallback value
        for key in sorted(missing):
            set_nested(loc_obj, key, en_flat[key])

        # Remove extra keys
        for key in sorted(extra):
            parts = key.split('.')
            obj = loc_obj
            for p in parts[:-1]:
                obj = obj.get(p, {})
            obj.pop(parts[-1], None)

        with open(fpath, 'w', encoding='utf-8') as f:
            json.dump(loc_obj, f, ensure_ascii=False, indent=2)
            f.write('\n')

        print(f"{fname}: added {len(missing)} missing, removed {len(extra)} extra")


if __name__ == '__main__':
    main()
