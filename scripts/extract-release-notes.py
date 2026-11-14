#!/usr/bin/env python3
"""Extracts the release notes section for a tag from CHANGELOG.md.

Usage: extract-release-notes.py <tag-without-v> <changelog-path> <output-path>
"""
import re
import sys


def main():
    tag = sys.argv[1]
    changelog = sys.argv[2]
    output = sys.argv[3]

    text = open(changelog, encoding='utf-8').read()
    match = re.search(
        r'## \[' + re.escape(tag) + r'\][^\n]*\n(.*?)(?=\n## \[|\Z)',
        text,
        re.S,
    )
    body = match.group(1).strip() if match else ''
    open(output, 'w', encoding='utf-8').write(body)
    if not body:
        print('warning: no changelog section found for ' + tag, file=sys.stderr)


if __name__ == '__main__':
    main()
