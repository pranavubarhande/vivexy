---
name: skill-creator
description: Use this skill when the user wants to create a new skill, turn a workflow from the conversation into a reusable skill, or edit or improve one of their existing skills.
---

# Skill Creator

Help the user turn a repeatable task into a Vivexy skill: capture what it should do, draft it, try it on realistic requests, refine it with the user's feedback, and save it with `save_user_skill`.

Figure out where the user is in this process and pick up from there. If they already have a draft, go straight to testing. If they just want a quick skill without testing, write it and save it once they approve.

Match your language to the user. Many are not developers, so explain terms like "trigger" or "test case" briefly the first time you use them.

## How Vivexy skills work

A skill has four parts:

- **name**: kebab-case, e.g. `board-memo`. Users can invoke it as `/board-memo`.
- **description**: always visible to the agent and decides when the skill is used, so lead with the trigger and keep it to 1–3 sentences.
- **content**: the markdown instructions, loaded only when the skill is used.
- **files** (optional): extra text files such as templates, examples, checklists or helper scripts. The agent loads one with `load_skill(name, file="...")` only when the instructions point to it.

Skills can use any tool the agent has (sandbox `execute_code`, `upload_sandbox_file_to_chat`, `render_chart`, web search, `ask_user`) and can point to built-in skills such as `docx`, `xlsx`, `pptx` or `pdf` for file formats. To bundle a script, store it in `files`, and tell the skill to load it, write it to the sandbox with `execute_code`, and run it.

## 1. Capture intent

If the conversation already shows the workflow (the user says "turn this into a skill"), extract the steps, tools used, corrections the user made, and input and output formats from it first, then confirm with the user.

Otherwise ask:

1. What should the skill let the agent do?
2. When should it be used — what would a user typically say?
3. What should the output look like (a file type, a chat answer, a chart)?
4. Are there edge cases, example inputs, or quality bars to respect?

Ask follow-ups about missing details before drafting, and group your questions into one `ask_user` call where possible.

## 2. Draft the skill

Write the description first. Make it specific and a little pushy, because agents tend to under-use skills: name the task and the phrases and contexts that should trigger it, e.g. "Use this skill whenever the user asks for a board memo, a board update, or a summary for directors, even if they don't say 'memo'."

Then write the content:

- Use imperative instructions and explain why each step matters instead of piling on ALWAYS and NEVER; the agent follows reasoning better than rules.
- Keep it general, not tied to the examples you were shown.
- Define output formats with a template, and add one or two short input/output examples when the format matters.
- Keep the content focused, ideally under 300 lines. Move long references (style guides, field mappings, sample documents) into `files` and say when to load each.
- Never include anything that would surprise the user if described plainly, such as hidden data collection or bypassing permissions.

Show the user the full draft (name, description, content and files) in chat before testing.

## 3. Test the draft

Write 2–3 realistic test requests, the way a real user would phrase them, with concrete details such as company names, figures or file types. Include at least one borderline request where the skill should or shouldn't apply. Confirm them with the user.

For each request, follow the draft's instructions exactly as written to produce the result, as if you'd just loaded the skill. Keep the outputs short where you can (a sample section rather than a full 20-page report). Then report:

- whether the description would clearly trigger (or correctly not trigger) for that request,
- the output, or a summary and the uploaded file,
- where the instructions were ambiguous, missing, or made you do needless work.

Ask the user what they would change.

## 4. Improve and repeat

- Generalize from feedback rather than patching individual examples; the skill will see many requests you didn't test.
- Remove instructions that aren't pulling their weight.
- If every test needed the same helper code or boilerplate, bundle it in `files` and point to it.
- Re-run the tests after meaningful changes, and stop when the user is happy or changes stop helping.

## 5. Save

Once the user approves the draft in chat, call `save_user_skill` with the name, description, content and any files. The app then shows them an approval dialog to confirm the save; if they reject it, ask what to change. Reusing an existing name updates that skill, so check with the user before overwriting one they already have. Tell them the skill now appears on their Skills page, applies from their next message, and can be invoked as `/name`.

To edit an existing skill, load it with `load_skill`, make the changes with the user, and save it under the same name.
