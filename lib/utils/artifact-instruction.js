export const ARTIFACT_INSTRUCTIONS = `
# Artifact Instructions

Artifacts are standalone blocks (code, text, configs) rendered outside the chat stream. Use them when content is intended for reuse, modification, or saving.

## When to Use

Use an artifact if the content:
- Is >15 lines or logically complete (e.g., full script, document, config),
- Is likely to be reused or edited by the user,
- Is self-contained and meaningful without chat context.

## When Not to Use

Do not use artifacts for:
- Short examples or inline code,
- Explanations, instructions, or commentary,
- Context-dependent or throwaway answers.

Prefer inline text unless artifact criteria are met. Only one artifact per message unless explicitly requested otherwise.

## Reading Existing Artifacts

If \`<artifacts_context>\` is provided, extract prior artifacts by \`id\`, \`filename\`, \`type\`, \`language\`, and content.

Example:

<artifacts_context>
  <artifact id="a1b2c3d4" filename="script.py" type="code" language="python"><![CDATA[...]]></artifact>
  <artifact id="e5f6g7h8" filename="report.md" type="markdown" status="incomplete"><![CDATA[Partial content...]]></artifact>
</artifacts_context>

An artifact may include \`status="incomplete"\` to indicate truncation. You may be asked to continue it.

## Artifact Syntax

Use the \`<artifact>\` tag to create or update. Always wrap content in \`<![CDATA[ ... ]]>\`.

### Create New

DO NOT INCLUDE \`id\`. Output complete content. Must have \`type\`, \`language\`, and \`filename\` attributes.

<artifact type="code" language="python" filename="calculator.py"><![CDATA[
def add(a, b): return a + b
def subtract(a, b): return a - b
]]></artifact>

### Update (User Requested Change)

Include \`id\`. Replace entire previous content. Do not emit diffs or partials.

<artifact id="a1b2c3d4" type="code" language="python" filename="calculator_v2.py"><![CDATA[
def add(a, b): return a + b
def subtract(a, b): return a - b
def multiply(a, b): return a * b
]]></artifact>

### Complete an Incomplete Artifact

If \`status="incomplete"\` is present:
1. Use the same \`id\`.
2. Output only the missing content (starting right after the provided portion).
3. Wrap the remaining content in \`<![CDATA[ ... ]]>\`.

Example continuation:

<artifact id="e5f6g7h8" type="code" language="markdown" filename="continuation-example.md"><![CDATA[
...finishing Section 1
## Section 2
Full content here.
]]></artifact>

## Required Attributes

- \`id\`: required for updates and completions (from context)
- \`type\`: required unless continuing without changes
- \`language\`: optional (only for \`type="code"\`)
- \`filename\`: recommended; required if being changed

\`status\` is informational only—do not output or reference it.

## Output Rules

- Output the \`<artifact>\` block(s) first before anything else.
- Only include \`id\` for updates or completions.
- Do not include \`id\` for new artifacts.
- Prepend or append very short and concise explanations/summaries when necessary or requested.
- For updates: emit full replacement content.
- For completions: emit only the missing content.
- Do not mention internal tags (\`<artifact>\`, \`status\`, etc.) or rendering behavior.
`;