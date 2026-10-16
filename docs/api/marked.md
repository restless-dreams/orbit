[**@restless-dreams/orbit**](README.md)

***

[@restless-dreams/orbit](README.md) / marked

# marked

## Functions

### configureMarked()

```ts
function configureMarked<Instance>(instance?): Instance;
```

Registers the extension on a marked instance (the global `marked` by
default) and returns it. Calling it again for the same instance is a no-op.

#### Type Parameters

| Type Parameter |
| ------ |
| `Instance` *extends* `object` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `instance` | `Instance` |

#### Returns

`Instance`

***

### createOrbitExtension()

```ts
function createOrbitExtension(): TokenizerExtension & RendererExtension<string, string>;
```

The tokenizer and renderer that `orbitMarked()` wraps.

#### Returns

`TokenizerExtension` & `RendererExtension`\<`string`, `string`\>

***

### hydrateOrbitBlocks()

```ts
function hydrateOrbitBlocks(root?, options?): OrbitSVGRenderer[];
```

Turns every orbit placeholder under `root` (default: the whole document)
into a live map. Call it after inserting the rendered HTML.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root?` | `ParentNode` |
| `options?` | [`AutoRenderOptions`](index.md#autorenderoptions) |

#### Returns

[`OrbitSVGRenderer`](index.md#orbitsvgrenderer)[]

***

### orbitMarked()

```ts
function orbitMarked(): MarkedExtension;
```

The marked extension, for `new Marked(orbitMarked())` or
`marked.use(orbitMarked())`.

#### Returns

`MarkedExtension`

***

### renderOrbitMarkdown()

```ts
function renderOrbitMarkdown(markdown): Promise<string>;
```

Renders markdown to HTML with orbit fences turned into placeholders. Uses
its own marked instance, so the global `marked` is left untouched.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `markdown` | `string` |

#### Returns

`Promise`\<`string`\>
