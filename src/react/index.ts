/**
 * React wrapper around the framework-agnostic `OrbitSVGRenderer`.
 */

import { createElement, forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { HTMLAttributes } from 'react';
import { OrbitSVGRenderer } from '../core/svg-renderer.js';
import { parseOrbit } from '../core/dispatch.js';
import { reportParseDiagnostics } from '../core/diagnostics.js';
import { OrbitWords } from '../core/languages.js';
import { renderToSVGString } from '../core/render-to-svg.js';
import type { OrbitAction, OrbitNodeType } from '../core/extensions.js';
import type { OrbitDocument, OrbitNode, RendererOptions, ViewMode } from '../core/types.js';

export interface OrbitMindMapProps extends RendererOptions, Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Markdown or YAML source, parsed with `parseOrbit`. Its frontmatter options apply unless a prop overrides them. */
  source?: string;

  /** A parsed document. Its frontmatter options apply unless a prop overrides them. */
  document?: OrbitDocument;

  /** A node tree, for maps built in code. */
  data?: OrbitNode;

  /**
   * The focused node's id, to control focus from your state. The map flies
   * to it when it changes; pair it with `onFocusChange` to follow the reader.
   */
  focusedId?: string;

  /**
   * Render a static SVG of the map until the live one mounts, so server
   * rendering and slow connections show the map right away. Default true.
   */
  staticFallback?: boolean;
}

export interface OrbitMindMapRef {
  /** The renderer, once the map has mounted. */
  readonly renderer: OrbitSVGRenderer | null;

  /** Flies to a node by id, in focus mode. Returns false when there's no such node. */
  flyTo(nodeId: string): boolean;

  /** Flies out to the overview of the whole map. */
  overview(): void;

  getViewMode(): ViewMode | null;
  setViewMode(mode: ViewMode): void;

  /** Zooms by `factor` around the middle of the map (above 1 zooms in). */
  zoomBy(factor: number): void;

  /** Returns the camera to the fitted view. */
  fit(): void;
}

type Callbacks = Pick<
  RendererOptions,
  | 'onNodeClick' | 'onViewModeChange' | 'onAction' | 'onFocusChange' | 'onSpinSettle' | 'onNodeContext' | 'onEdit' | 'onEditorOpen' | 'onEditorClose' | 'onNodeDrag'
  | 'onMediaOpen' | 'onMediaClose' | 'onMediaState' | 'noteRenderer' | 'nodeTypeFor'
>;

/** What actions declare, as a value to compare: their functions count only as being there. */
const actionsKey = (actions: OrbitAction[]): unknown[] => {
  return actions.map((action) => [action.id, typeof action.label === 'string' ? action.label : null, action.icon ?? null, Boolean(action.when)]);
};

/** What node types declare, as a value to compare. */
const nodeTypesKey = (types: Record<string, OrbitNodeType>): string => {
  return JSON.stringify(Object.entries(types).map(([name, type]) => [
    name, type.label ?? null, type.icon ?? null, type.color ?? null, type.tokens ?? null, type.version ?? null,
    Boolean(type.render), Boolean(type.details), Boolean(type.upgrade), type.actions ? actionsKey(type.actions) : null,
  ]));
};

/** Actions that call the latest props' functions, so new identities on every render never redraw the map. */
const delegateActions = (actions: OrbitAction[], read: () => OrbitAction[] | undefined): OrbitAction[] => {
  return actions.map((action) => {
    const latest = () => read()?.find((candidate) => candidate.id === action.id) ?? action;
    return {
      id: action.id,
      icon: action.icon,
      label: typeof action.label === 'function'
        ? (node) => {
          const label = latest().label;
          return typeof label === 'function' ? label(node) : label;
        }
        : action.label,
      when: action.when ? (node) => latest().when?.(node) ?? true : undefined,
      run: (node, event) => latest().run(node, event),
    };
  });
};

/** Node types that call the latest props' functions. */
const delegateNodeTypes = (types: Record<string, OrbitNodeType>, read: () => Record<string, OrbitNodeType> | undefined): Record<string, OrbitNodeType> => {
  return Object.fromEntries(Object.entries(types).map(([name, type]) => [name, {
    label: type.label,
    icon: type.icon,
    color: type.color,
    tokens: type.tokens,
    version: type.version,
    upgrade: type.upgrade ? (node, from) => read()?.[name]?.upgrade?.(node, from) : undefined,
    render: type.render ? (node, element) => read()?.[name]?.render?.(node, element) : undefined,
    details: type.details ? (node, element) => read()?.[name]?.details?.(node, element) : undefined,
    actions: type.actions ? delegateActions(type.actions, () => read()?.[name]?.actions) : undefined,
  } satisfies OrbitNodeType]));
};

/**
 * Renders an orbit map that fills its parent element, so give the parent a
 * size. Pass the map as `source` (markdown or YAML), `document` or `data`.
 *
 * Callback props can be inline functions and `theme` / `palette` can be
 * inline objects: they never rebuild the map unless their values change.
 *
 * @example
 * ```tsx
 * import { OrbitMindMap } from '@restless-dreams/orbit/react';
 *
 * <div style={{ height: 480 }}>
 *   <OrbitMindMap source={'# Launch\n## Research\n## Build'} theme="night" onFocusChange={(node) => console.log(node.text)} />
 * </div>
 * ```
 */
export const OrbitMindMap = forwardRef<OrbitMindMapRef, OrbitMindMapProps>(
  ({
    source,
    document: orbitDocument,
    data,
    viewMode,
    showRings,
    interactive,
    orbitAnimation,
    orbitSpeed,
    maxDepth,
    palette,
    theme,
    ariaLabel,
    language,
    strings,
    showControls,
    showActionButtons,
    showDetailSheet,
    mediaViewer,
    baseUrl,
    spin,
    zoom,
    insets,
    transitionDuration,
    onNodeClick,
    onViewModeChange,
    onAction,
    onFocusChange,
    onSpinSettle,
    onNodeContext,
    onEdit,
    onEditorOpen,
    onEditorClose,
    onNodeDrag,
    onMediaOpen,
    onMediaClose,
    onMediaState,
    editable,
    editingKeys,
    longPressDelay,
    noteRenderer,
    nodeTypeFor,
    nodeTypes,
    actions,
    statuses,
    focusedId,
    focus,
    staticFallback = true,
    style,
    ...elementProps
  }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const staticRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<OrbitSVGRenderer | null>(null);
    const [mounted, setMounted] = useState(false);
    const staticId = useId();

    // Read the renderer at call time, so the handle works from the first commit.
    useImperativeHandle(ref, () => ({
      get renderer() {
        return rendererRef.current;
      },
      flyTo: (nodeId) => rendererRef.current?.flyTo(nodeId) ?? false,
      overview: () => rendererRef.current?.overview(),
      getViewMode: () => rendererRef.current?.getViewMode() ?? null,
      setViewMode: (mode) => rendererRef.current?.setViewMode(mode),
      zoomBy: (factor) => rendererRef.current?.zoomBy(factor),
      fit: () => rendererRef.current?.fit(),
    }), []);

    // The renderer holds stable wrappers that call the latest props, so new
    // function identities on every render never reach it.
    const callbacksRef = useRef<Callbacks>({});

    useEffect(() => {
      callbacksRef.current = {
        onNodeClick, onViewModeChange, onAction, onFocusChange, onSpinSettle, onNodeContext, onEdit, onEditorOpen, onEditorClose, onNodeDrag,
        onMediaOpen, onMediaClose, onMediaState, noteRenderer, nodeTypeFor,
      };
    });

    const hasNoteRenderer = noteRenderer !== undefined;
    const hasNodeTypeFor = nodeTypeFor !== undefined;
    const hasNodeContext = onNodeContext !== undefined;
    const callbacks = useMemo<Callbacks>(() => ({
      onNodeClick: (node) => callbacksRef.current.onNodeClick?.(node),
      onViewModeChange: (mode) => callbacksRef.current.onViewModeChange?.(mode),
      onAction: (event) => callbacksRef.current.onAction?.(event),
      onFocusChange: (node) => callbacksRef.current.onFocusChange?.(node),
      onSpinSettle: (planet) => callbacksRef.current.onSpinSettle?.(planet),
      onEdit: (edit) => callbacksRef.current.onEdit?.(edit),
      onEditorOpen: (event) => callbacksRef.current.onEditorOpen?.(event),
      onEditorClose: (event) => callbacksRef.current.onEditorClose?.(event),
      onNodeDrag: (event) => callbacksRef.current.onNodeDrag?.(event),
      onMediaOpen: (event) => callbacksRef.current.onMediaOpen?.(event),
      onMediaClose: (event) => callbacksRef.current.onMediaClose?.(event),
      onMediaState: (state) => callbacksRef.current.onMediaState?.(state),
      // Left undefined without a prop: having one takes long presses from the map.
      onNodeContext: hasNodeContext ? (event) => callbacksRef.current.onNodeContext?.(event) : undefined,
      // Left undefined without a prop so the built-in note view applies.
      noteRenderer: hasNoteRenderer
        ? (note, context) => callbacksRef.current.noteRenderer?.(note, context) ?? ''
        : undefined,
      // Asks the latest prop each time the map draws: a new function on every render never redraws the map.
      nodeTypeFor: hasNodeTypeFor ? (node) => callbacksRef.current.nodeTypeFor?.(node) : undefined,
    }), [hasNoteRenderer, hasNodeContext, hasNodeTypeFor]);

    // Node types and actions hold functions: compare what they declare by
    // value, and call their latest functions through stable wrappers.
    const extensionsRef = useRef({ nodeTypes, actions });

    useEffect(() => {
      extensionsRef.current = { nodeTypes, actions };
    });

    const typesKey = nodeTypes === undefined ? undefined : nodeTypesKey(nodeTypes);
    const actionKey = actions === undefined ? undefined : JSON.stringify(actionsKey(actions));
    const statusesKey = statuses === undefined ? undefined : JSON.stringify(statuses);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key stands for nodeTypes
    const stableNodeTypes = useMemo(() => (nodeTypes === undefined ? undefined : delegateNodeTypes(nodeTypes, () => extensionsRef.current.nodeTypes)), [typesKey]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key stands for actions
    const stableActions = useMemo(() => (actions === undefined ? undefined : delegateActions(actions, () => extensionsRef.current.actions)), [actionKey]);
    const stableStatuses = useMemo(() => (statusesKey === undefined ? undefined : JSON.parse(statusesKey)), [statusesKey]);

    // Compare object props by value: inline objects are fine.
    const themeKey = theme === undefined ? undefined : JSON.stringify(theme);
    const paletteKey = palette === undefined ? undefined : JSON.stringify(palette);
    const spinKey = spin === undefined ? undefined : JSON.stringify(spin);
    const stringsKey = strings === undefined ? undefined : JSON.stringify(strings);
    const zoomKey = zoom === undefined ? undefined : JSON.stringify(zoom);
    const insetsKey = insets === undefined ? undefined : JSON.stringify(insets);
    const stableTheme = useMemo(() => (themeKey === undefined ? undefined : JSON.parse(themeKey)), [themeKey]);
    const stablePalette = useMemo(() => (paletteKey === undefined ? undefined : JSON.parse(paletteKey)), [paletteKey]);
    const stableSpin = useMemo(() => (spinKey === undefined ? undefined : JSON.parse(spinKey)), [spinKey]);
    const stableStrings = useMemo(() => (stringsKey === undefined ? undefined : JSON.parse(stringsKey)), [stringsKey]);
    const stableZoom = useMemo(() => (zoomKey === undefined ? undefined : JSON.parse(zoomKey)), [zoomKey]);
    const stableInsets = useMemo(() => (insetsKey === undefined ? undefined : JSON.parse(insetsKey)), [insetsKey]);

    const options = useMemo<RendererOptions>(() => ({
      viewMode,
      showRings,
      interactive,
      orbitAnimation,
      orbitSpeed,
      maxDepth,
      palette: stablePalette,
      theme: stableTheme,
      ariaLabel,
      language,
      strings: stableStrings,
      showControls,
      showActionButtons,
      showDetailSheet,
      mediaViewer,
      editable,
      editingKeys,
      longPressDelay,
      baseUrl,
      spin: stableSpin,
      zoom: stableZoom,
      insets: stableInsets,
      transitionDuration,
      nodeTypes: stableNodeTypes,
      actions: stableActions,
      statuses: stableStatuses,
      ...callbacks,
    }), [
      viewMode, showRings, interactive, orbitAnimation, orbitSpeed, maxDepth, stablePalette, stableTheme,
      ariaLabel, language, stableStrings, showControls, showActionButtons, showDetailSheet, mediaViewer, editable, editingKeys, longPressDelay, baseUrl,
      stableSpin, stableZoom, stableInsets, transitionDuration, stableNodeTypes, stableActions, stableStatuses, callbacks,
    ]);

    const input = useMemo<OrbitDocument | OrbitNode | undefined>(() => {
      if (orbitDocument) {
        return orbitDocument;
      }

      if (source !== undefined) {
        // A made-up root takes the language's name; without the language prop, it's the renderer's to find on the page.
        const parsed = parseOrbit(source, { untitled: language ? new OrbitWords(language, stableStrings).text('untitledMap') : undefined });
        reportParseDiagnostics(parsed);
        return parsed;
      }

      return data;
    }, [orbitDocument, source, data, language, stableStrings]);

    // Create the renderer once. The effects below keep its options and map
    // current; on mount they set the same options (a no-op) and draw once.
    const optionsRef = useRef(options);
    const initialFocusRef = useRef(focusedId ?? focus);

    useEffect(() => {
      optionsRef.current = options;
    });

    useEffect(() => {
      // The static picture steps aside before the live map measures its space.
      if (staticRef.current) {
        staticRef.current.hidden = true;
      }

      // A controlled focus opens the map on that node, without a flight to it.
      const renderer = new OrbitSVGRenderer(containerRef.current!, { ...optionsRef.current, focus: initialFocusRef.current });
      rendererRef.current = renderer;
      setMounted(true);

      return () => {
        renderer.destroy();
        rendererRef.current = null;
      };
    }, []);

    useEffect(() => {
      rendererRef.current?.setOptions(options);
    }, [options]);

    useEffect(() => {
      if (input) {
        rendererRef.current?.render(input);
      }
    }, [input]);

    useEffect(() => {
      const renderer = rendererRef.current;

      if (!renderer || focusedId === undefined) {
        return;
      }

      const path = renderer.getFocusPath();

      if (path[path.length - 1] !== focusedId) {
        renderer.focusNode(focusedId);
      }
    }, [focusedId, input]);

    // Server rendering and the first client render draw a static picture of
    // the map; the live map replaces it once it mounts.
    const staticMarkup = useMemo(() => {
      if (!staticFallback || mounted || !input) {
        return '';
      }

      return renderToSVGString(input, {
        responsive: true,
        idPrefix: `orbit-static-${staticId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
        viewMode,
        focus: focusedId ?? focus,
        theme: stableTheme,
        palette: stablePalette,
        maxDepth,
        showRings,
        title: ariaLabel,
        language,
        strings: stableStrings,
        baseUrl,
        nodeTypes: stableNodeTypes,
        statuses: stableStatuses,
      });
    }, [
      staticFallback, mounted, input, staticId, viewMode, focusedId, focus, stableTheme, stablePalette, maxDepth, showRings, ariaLabel, language, stableStrings,
      baseUrl, stableNodeTypes, stableStatuses,
    ]);

    return createElement(
      'div',
      {
        ...elementProps,
        ref: containerRef,
        style: {
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          ...style,
        },
      },
      staticMarkup
        ? createElement('div', {
          ref: staticRef,
          'data-orbit-static': '',
          style: { width: '100%', height: '100%' },
          dangerouslySetInnerHTML: { __html: staticMarkup },
        })
        : null,
    );
  },
);

OrbitMindMap.displayName = 'OrbitMindMap';

