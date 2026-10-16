# Map tools for AI

Map tools let a language model read a map and change it: add ideas and whole branches, rename them, mark them done, move, sort and remove them. They come in the shape each provider's API takes, so an app can offer an assistant with whichever model its people choose. They work on a map on screen, where every change animates into place, or on a document on a server. A call a model gets wrong changes nothing, and its result says what to send instead.

## Add an assistant to a map

`createMapTools(map)` gives the tools for one map. `tools.for(provider)` lists them for the model, and `tools.run(name, input)` carries out each call it makes. With Anthropic's API:

```js
import Anthropic from '@anthropic-ai/sdk';
import { createOrbitMap, createMapTools } from '@restless-dreams/orbit';

const map = createOrbitMap(element, markdown, { onEdit: () => save(map.toMarkdown()) });
const tools = createMapTools(map);
const client = new Anthropic({ apiKey });

const ask = async (request) => {
  const messages = [{ role: 'user', content: request }];

  while (true) {
    const response = await client.messages.create({ model, max_tokens: 4096, system: tools.instructions, tools: tools.for('anthropic'), messages });
    messages.push({ role: 'assistant', content: response.content });
    const calls = response.content.filter((block) => block.type === 'tool_use');

    if (calls.length === 0) {
      return response.content.find((block) => block.type === 'text')?.text;
    }

    messages.push({
      role: 'user',
      content: calls.map((call) => {
        const result = tools.run(call.name, call.input);
        return { type: 'tool_result', tool_use_id: call.id, content: result.text, is_error: !result.ok };
      }),
    });
  }
};

await ask('Add three day trips from Kyoto, each with a one-sentence note');
```

The map changes as the model works: each new idea flies out of its parent, and `edit` fires for each change, so the map saves as it does when people edit it. Keep API keys off public pages: call the model from your server, or let each person bring their own key.

## Other providers

**OpenAI's Responses API:**

```js
const input = [{ role: 'user', content: request }];

while (true) {
  const response = await openai.responses.create({ model, instructions: tools.instructions, tools: tools.for('openai'), input });
  const calls = response.output.filter((item) => item.type === 'function_call');

  if (calls.length === 0) {
    return response.output_text;
  }

  input.push(...response.output);

  for (const call of calls) {
    input.push({ type: 'function_call_output', call_id: call.call_id, output: tools.run(call.name, call.arguments).text });
  }
}
```

`run` takes the arguments as OpenAI sends them, as JSON text. The tools are written without strict mode, which would make the model send every field of every call.

**Chat Completions,** which most other providers and local servers (OpenRouter, Ollama and many more) offer as well as OpenAI:

```js
const messages = [{ role: 'system', content: tools.instructions }, { role: 'user', content: request }];

while (true) {
  const response = await client.chat.completions.create({ model, messages, tools: tools.for('openai-chat') });
  const message = response.choices[0].message;
  messages.push(message);

  if (!message.tool_calls?.length) {
    return message.content;
  }

  for (const call of message.tool_calls) {
    messages.push({ role: 'tool', tool_call_id: call.id, content: tools.run(call.function.name, call.function.arguments).text });
  }
}
```

**Gemini,** with `@google/genai`:

```js
const contents = [{ role: 'user', parts: [{ text: request }] }];

while (true) {
  const response = await ai.models.generateContent({ model, contents, config: { systemInstruction: tools.instructions, tools: tools.for('gemini') } });
  const calls = response.functionCalls ?? [];

  if (calls.length === 0) {
    return response.text;
  }

  contents.push(response.candidates[0].content);
  contents.push({
    role: 'user',
    parts: calls.map((call) => {
      const result = tools.run(call.name, call.args);
      return { functionResponse: { name: call.name, response: result.ok ? { output: result.text } : { error: result.text } } };
    }),
  });
}
```

**MCP:** `tools.definitions` are tools as MCP lists them (`name`, `description`, `inputSchema` and `annotations`). A server returns them for `tools/list`, and answers `tools/call` with `{ content: [{ type: 'text', text: result.text }], isError: !result.ok }`.

For anything else, such as the Vercel AI SDK or LangChain, build the tools from `tools.definitions`: each has a name, a description, and its input as JSON Schema.

## The tools

| Tool | What it does | Takes |
| --- | --- | --- |
| `read_map` | The map as an outline: each node's title, id and attributes, and the start of its note. A big map is cut short, whole levels first, with what's left out counted. | `node_id` (to read one branch), `depth` |
| `find_nodes` | Searches titles, notes and tags, in any case and with or without accents, and statuses by what they mean: `done` finds `shipped` too. | `query`, `status`, `tag` |
| `read_node` | Everything about one node: its whole note, its picture, video or page, where it is, its children, and the nodes that link to it. | `node_id` |
| `add_nodes` | Adds nodes, or whole branches, written as a markdown list. | `parent_id`, `outline`, `index` |
| `update_node` | Changes a title or attributes, and `clear` removes attributes. | `node_id`, `text`, `note`, `status`, `priority`, `tags`, `icon`, `color`, `link`, `image`, `video`, `embed`, `collapsed`, `clear` |
| `move_node` | Moves a branch under another node, or to another place among its siblings. | `node_id`, `parent_id`, `index` |
| `reorder_children` | Puts all the children of a node in a new order at once: to sort them, or to group them. | `parent_id`, `order` |
| `remove_node` | Removes a branch. Never the root. | `node_id` |
| `show_node` | Flies the map to a node. Only on a map on screen. | `node_id` |

New ideas come as orbit-md, the way models write any outline: each list item is a node, the items indented under it are its children, at any depth, and indented text that isn't an item is its note. Checkboxes, an emoji first, hashtags at the end and `<!-- orbit … -->` comments set statuses, icons, tags and other attributes, as in any map:

```json
{
  "parent_id": "marketing",
  "outline": "- Social media\n  - [ ] Instagram #social\n  - TikTok\n- Newsletter\n  A weekly email with what shipped."
}
```

## What a call returns

`run` returns `{ ok, text, changed }`:

- **`text`** is for the model: send it back as the tool's result. It names nodes with their ids (`"Instagram" #instagram`), gives the new id when a new title changes one, and adds notes worth knowing, such as an id the model wrote as a title, a field the tool doesn't take, or two ideas with the same title side by side.
- **`ok`** is false when the call couldn't be carried out. Nothing changed, and `text` says why and what to send instead:

```text
No node has the id "lanch". Did you mean "Launch" #launch? read_map and find_nodes give every node's id.

"Build" #build can't go under "Frontend" #frontend, which is inside it. Move "Frontend" #frontend out of it first, or choose another parent. Nothing changed.

outline doesn't read cleanly. Fix this, and send it again:
- Line 2: Unknown attribute "colour". Did you mean "color"?
Lines count from the outline's first line. Nothing changed.
```

- **`changed`** says whether the map changed.

`run` never throws over a call a model gets wrong. It forgives what models often send: input as JSON text, `null` for a field left out, a number as text, tags as words separated by commas, an id with its `#`, a title only one node has instead of its id, and a field under the name models often give it (`title` for `text`, `parent` for `parent_id`). An id from before a rename still finds its node, and the id of a removed node says it was removed. A misspelled field, or a value the map can't use, changes nothing and says what it takes.

## On screen, or on a server

- **A map on screen:** `createMapTools(map)` takes what `createOrbitMap` returns, the `renderer` of an `<orbit-map>` element, or the `renderer` of `OrbitMindMap`'s ref. Each change goes through `addNode`, `updateNode`, `moveNode` and `removeNode` (see [Editing](editing.md)): it animates, Orbit announces it, and `edit` fires. `read_map` says which node the reader is looking at, and `show_node` takes them to one.
- **A document:** `createMapTools(markdown)` or `createMapTools(parseOrbit(markdown))`, on a server or anywhere without a map on screen. The tools change the document in place, and `serializeOrbitMarkdown(tools.document)` saves it, the way it was written apart from what changed.

```js
import { writeFile } from 'node:fs/promises';
import { createMapTools, serializeOrbitMarkdown } from '@restless-dreams/orbit';

const tools = createMapTools(markdown);
tools.run('add_nodes', { parent_id: 'research', outline: '- Interviews\n- Survey' });
await writeFile('map.md', serializeOrbitMarkdown(tools.document));
```

Options:

- **`readOnly: true`** offers only the tools that read (and `show_node`, on screen): for an assistant that answers questions about a map.
- **`readLimit`**: the most nodes `read_map` shows at once. Default 250.

## Good to know

- **Instructions.** `tools.instructions` says how to use the tools, and asks for short titles with the detail in notes, ideas in the map's language, and nodes removed only when asked: put it in the system prompt. To save the model a first call, put `tools.run('read_map').text` in the first message too.
- **Undo.** Keep `map.toMarkdown()` from before a request: `map.render(saved)` puts the map back, animating to it.
- **Asking first.** Each definition's `annotations` say whether the tool only reads (`readOnlyHint`) and whether it can overwrite or remove something (`destructiveHint`). An app can run the tools that read at once and ask before the others, as MCP clients do.
- **Schemas every provider reads.** The inputs use plain JSON Schema, without references or unions, and new branches come as markdown rather than nested objects, which some providers' schemas can't describe.
- **Newer maps.** A map written for a newer version of the format can be read but not changed, so nothing this version doesn't understand is lost.
