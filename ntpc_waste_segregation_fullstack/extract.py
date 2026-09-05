import json

transcript_path = r"C:\Users\aadit\.gemini\antigravity-ide\brain\656cdc7a-3c4d-431c-9531-dff5a6051f3f\.system_generated\logs\transcript_full.jsonl"
html_versions = []
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get('tool_calls'):
                for call in data['tool_calls']:
                    fn_name = call.get('function', {}).get('name')
                    if fn_name in ('write_to_file', 'replace_file_content', 'multi_replace_file_content'):
                        args_str = call.get('function', {}).get('arguments', '{}')
                        args = json.loads(args_str)
                        if 'ntpc.html' in args.get('TargetFile', ''):
                            html_versions.append(args)
        except Exception as e:
            pass

with open('extract.log', 'w', encoding='utf-8') as f:
    f.write(f"Found {len(html_versions)} changes to ntpc.html\n")
    for i, args in enumerate(html_versions):
        content = args.get('CodeContent', args.get('ReplacementContent', str(args)))
        has_tw = 'tailwind' in content
        f.write(f"Version {i} tailwind={has_tw}\n")
        if has_tw:
            with open(f'templates/ntpc_{i}.html', 'w', encoding='utf-8') as out:
                out.write(content)
