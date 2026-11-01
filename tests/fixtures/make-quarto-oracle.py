#!/usr/bin/env python3
"""Write tests/fixtures/quarto-settings-oracle.json: what a real YAML reader (PyYAML) makes of each _quarto.yml case.

tests/quarto-settings.test.mjs checks that every case the slide-qa detector accepts is read the same way by the line
scanner (issue #46, verify round 1). Node built-ins only at run time (design D10): this script is run by hand when the
cases change; its output is committed.  Usage:  python3 tests/fixtures/make-quarto-oracle.py
"""
import json, os, yaml

CASES = {
    # read by the scanner
    'block render list': 'project:\n  type: default\n  render:\n    - deck.qmd\n',
    'flow render list, quoted values and ./': 'project:\n  render: [\'./deck.qmd\', "b.qmd"]\n',
    'flow render list over several lines': 'project:\n  render: [\n    deck.qmd,\n    b.qmd\n  ]\n',
    'single render value': 'project:\n  render: deck.qmd\n',
    'unquoted comma in a flow list': 'project:\n  render: [a.qmd, b.qmd]\n',
    'ampersand in a render value': 'project:\n  render:\n    - Q & A.qmd\n',
    'revealjs output-file': 'format:\n  revealjs:\n    output-file: slides\n',
    'revealjs output-file after other keys': 'format:\n  html:\n    toc: true\n  revealjs:\n    theme: default\n    output-file: slides\n',
    'top-level output-file, quoted': 'output-file: "slides.html"\n',
    'quoted output-file holding a comma': 'output-file: "slides, final"\n',
    'revealjs wins over the top level': 'output-file: top\nformat:\n  revealjs:\n    output-file: inner\n',
    "another format's output-file": 'format:\n  pdf:\n    output-file: handout\n  revealjs:\n    theme: default\n',
    'a deeper render key': 'project:\n  preview:\n    render: deck.qmd\n',
    'pre-render and post-render': 'project:\n  pre-render: prepare.sh\n  post-render: [finish.sh]\n  render: [deck.qmd]\n',
    'key-like text in a quoted value': 'title: "the project: render: a demo"\nproject:\n  render: [deck.qmd]\n',
    'block scalar quoting settings': 'description: |\n  project: {render: [example.qmd]}\n  output-file: no\nproject:\n  render: [deck.qmd]\n',
    'block scalar under revealjs': 'format:\n  revealjs:\n    output-file: slides\n    notes: |\n      output-file: wrong\n',
    'comments': '# project: {render: [x.qmd]}\nproject:  # here\n  render: [deck.qmd]  # deck\n',
    'document marker at the top': '---\nproject:\n  render: [deck.qmd]\n',
    'CRLF line ends': 'project:\r\n  render:\r\n    - deck.qmd\r\nformat:\r\n  revealjs:\r\n    output-file: slides\r\n',
    'UTF-8 byte order mark': '﻿project:\n  render: [deck.qmd]\n',
    'empty revealjs mapping': 'format:\n  revealjs: {}\n',
    'website format mapping': 'website:\n  format: {a: b}\nproject:\n  render: [deck.qmd]\n',
    'metadata-files list': 'metadata-files: [shared.yml]\nproject:\n  render: [deck.qmd]\n',
    'nothing': '',
    'document end marker': 'project:\n  render: [deck.qmd]\n...\n',
    'one-line format flow without an output name': 'format: {pdf: default, revealjs: {incremental: true}}\n',
    'one-line project flow without render': 'project: {type: default}\n',
    'format flow with an output name': 'format: {revealjs: {output-file: slides}}\n',
    'multi-line format flow': 'format: {\n  revealjs: {\n    output-file: slides\n  }\n}\n',
    'quoted output-file at the top level': '"output-file": slides\n',
    'plain scalar continued inside a flow list': 'project:\n  render: [\n    my\n    talk.qmd\n  ]\n',
    "flow list continued at the key's indent": 'project:\n  render: [a.qmd,\n  b.qmd]\n',
    'anchored block scalar under revealjs': 'format:\n  revealjs:\n    output-file: slides\n    notes: &n |\n      output-file: wrong\n',
    'output-file deeper under revealjs': 'format:\n  revealjs:\n    foo:\n      output-file: x\n',
    'null output-file': 'output-file: ~\n',
    # forms the detector must refuse (refused cases are skipped by the oracle test; listed so a regression shows)
    'multi-line plain render item': 'project:\n  render:\n    - my\n      talk.qmd\n',
    'multi-line plain render value': 'project:\n  render: my\n    talk.qmd\n',
    'multi-line quoted render item': 'project:\n  render:\n    - "my\n      talk.qmd"\n',
    'multi-line plain output-file': 'format:\n  revealjs:\n    output-file: my\n      slides\n',
    'multi-line top-level output-file': 'output-file: my\n  slides\n',
    'unquoted comma in a block item': 'project:\n  render:\n    - my, talk.qmd\n',
    'quoted comma in a flow value': 'project:\n  render: ["a.qmd, notes.txt"]\n',
    'extension format output-file': 'format:\n  clean-revealjs:\n    output-file: slides\n',
    'flow mapping for project': 'project: {render: [deck.qmd]}\n',
    'JSON-style root': '{"project":{"render":["deck.qmd"]}}\n',
    'anchor and alias': 'targets: &t [deck.qmd]\nproject:\n  render: *t\n',
    'escape in output-file': 'output-file: "slid\\u0065s"\n',
}


def oracle(text):
    try:
        doc = yaml.safe_load(text)
    except yaml.YAMLError:
        return None
    if not isinstance(doc, dict):
        return {'render': [], 'outputFile': None}
    proj = doc.get('project')
    render = proj.get('render') if isinstance(proj, dict) else None
    render = [] if render is None else [render] if not isinstance(render, list) else render
    fmt = doc.get('format')
    out = None
    if isinstance(fmt, dict):
        rv = fmt.get('revealjs')
        if isinstance(rv, dict) and 'output-file' in rv:
            out = rv['output-file']
        else:  # an extension format such as clean-revealjs renders the deck too (#50)
            ext = [v for k, v in fmt.items() if isinstance(k, str) and k.endswith('-revealjs') and isinstance(v, dict) and 'output-file' in v]
            out = ext[0]['output-file'] if ext else None
    if out is None:
        out = doc.get('output-file')
    return {'render': [str(v) for v in render], 'outputFile': None if out is None else str(out)}


out = [{'name': n, 'yml': t, 'oracle': oracle(t)} for n, t in CASES.items()]
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'quarto-settings-oracle.json')
with open(path, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
    f.write('\n')
print(f'wrote {len(out)} cases to {path}')
