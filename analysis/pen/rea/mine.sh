#!/bin/bash
S=strings-index.txt
out=mine
mkdir -p $out
# tool + panel vocabulary
grep -iE '^(pen|pencil|frame|rectangle|ellipse|polygon|path|text|note|prompt|context|icon|script|browser|ref|group|slice|hand|zoom|lasso|arrow)' $S > $out/nodes.txt
grep -iE 'selection|marquee|snap|smart guide|handle|rotate|scale|resize|transform|flip|align|distribute|z-order|bring|send to' $S > $out/selection.txt
grep -iE 'vector|bezier|anchor|node tool|boolean|union|subtract|intersect|exclude|outline|stroke|corner radius|smooth|join|flatten' $S > $out/vector.txt
grep -iE 'font|typograph|letter spacing|line height|text style|kerning|variable font|open ?type|woff|google font|text align|text growth|paragraph' $S > $out/text.txt
grep -iE 'variable|theme|token|mode:|light|dark|color style|effect style|text style|library' $S > $out/variables.txt
grep -iE 'component|instance|reusable|ref node|detach|override|variant|slot|swap' $S > $out/components.txt
grep -iE 'prototype|transition|interaction|hotspot|flow|overlay|smart animate|easing|trigger|navigat' $S > $out/prototyping.txt
grep -iE 'present|slides|slide|presentation|speaker|thumbnail|page' $S > $out/presentation.txt
grep -iE 'export|import|pdf|png|jpeg|jpg|webp|svg|html|tailwind|css|code|figma|snapshot|clipboard' $S > $out/export.txt
grep -iE 'agent|claude|codex|openai|anthropic|gemini|cursor|llm|prompt|model|chat|mcp|skill|tool call|reasoning|token' $S > $out/ai.txt
grep -iE 'share|collab|multiplayer|presence|cursor chat|comment|thread|invite|workspace|member|realtime|ws' $S > $out/collab.txt
grep -iE 'shortcut|keybind|accelerator|cmd|ctrl|hotkey|keyboard' $S > $out/shortcuts.txt
grep -iE 'setting|preference|theme|appearance|onboard|tutorial|welcome|walkthrough|first run|tooltip|tip' $S > $out/settings.txt
grep -iE 'effect|shadow|blur|blend|shader|glsl|noise|gradient|mesh|displacement|texture|background blur' $S > $out/effects.txt
grep -iE 'image|photo|stock|unsplash|generate|vectoriz|remove background|replace background|crop|mask|fill' $S > $out/image.txt
grep -iE 'performance|gpu|webgl|wasm|render|fps|profil|lazy|worker' $S > $out/performance.txt
grep -iE 'accessib|a11y|contrast|aria|touch|screen reader' $S > $out/accessibility.txt
grep -iE 'file|document|save|autosave|recent|dashboard|project|folder|workspace|\.pen' $S > $out/file.txt
grep -iE 'motion|animat|timeline|keyframe|tween|easing|duration|delay|play|scrub' $S > $out/motion.txt
wc -l $out/*.txt
